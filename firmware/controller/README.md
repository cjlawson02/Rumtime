# Controller Firmware

Product firmware for **ESP32-S3-DevKitC-1** (Arduino / PlatformIO), implementing the locked runtime model in [`docs/16-firmware-and-software-architecture.md`](../../docs/16-firmware-and-software-architecture.md): a fixed-period **`ControlTask`** on Core 1 that is the sole owner of motor outputs, with distributed safety (each subsystem refuses unsafe work).

The **pump**, **scale**, **command queue**, **coordinator** (single-pump gated timed dispense), and **enqueue-only serial** transport are implemented; NVS, sequence runner, multi-pump parallel, and Wi-Fi/HTTP are still stubs or absent. The blocking-serial bench rig in [`firmware/bench-rig/`](../bench-rig/) stays as bring-up reference and is unchanged.

## Implemented vs stub

| Component | File(s) | State |
| --------- | ------- | ----- |
| `PumpChannel` | `pump_channel.{h,cpp}` | **Implemented** — one TB6612 channel (IN1/IN2/PWM); sole GPIO writer for its motor outputs; injected `GpioOps` seam enables host-side unit tests |
| `PumpBus` | `pump_bus.{h,cpp}` | **Implemented** — owns STBY + 2 channels; `run`/`stop`/`stopAll`; refuses `run()` and forces `stopAll()` when cutoff open; fails UNSAFE when uninitialized; configures direction/PWM before raising STBY; clamps duty |
| `ScalePlatform` | `scale_platform.{h,cpp}` | **Implemented** — non-blocking HX711 FSM; one conversion per `tick()`, multi-tick tare, rolling filter, flow-gate + no-flow timeout flags; injected `ScaleOps` seam enables host-side unit tests |
| `ControlTask` | `control_task.{h,cpp}` | **Skeleton** — 5 ms `vTaskDelayUntil` loop, tick order per doc 16; input→pump→scale path live; feeds TWDT each tick; restarts on `xTaskCreate` failure |
| `MachineInputs` | `machine_inputs.{h,cpp}` | **Stub** — fail-safe contract: real GPIO wired active-low + pull-up so a broken sense line reads cutoff-open; `setCutoffOpen(bool)` sim hook for native tests |
| `Coordinator` | `coordinator.{h,cpp}` | **Implemented** — one job at a time; non-blocking single-pump gated timed dispense sub-FSM advanced in `tick(now_ms)`; drives `PumpBus` + `ScalePlatform` only (no direct GPIO). No multi-pump / sequence runner yet |
| `CommandQueue` | `command_queue.{h,cpp}` | **Implemented (bench-verified, not host-tested)** — depth-1 FreeRTOS command queue + cancel flag; `begin()` fails fatal on alloc failure; `drainCancel()` runs before `drainCommand()`. `cancel_pending_` is `volatile` and must become `std::atomic` before the HTTP task lands (see prerequisites). Only `SerialTransport` enqueues for now |
| `StatusPublisher` | `status_snapshot.{h,cpp}` | **Stub** — `read()`/`publish()` not tear-free yet (single-writer placeholder; HTTP prerequisite); now carries `job_busy` / `job_ok` / `job_error` / `job_phase` |
| `SerialTransport` | `serial_transport.{h,cpp}` | **Implemented (bench-verified, not host-tested)** — non-blocking line parser polled from `ControlTask::tick()`; strict arg parsing + channel/ml bounds; rejects with `busy` when a job is running (reads the snapshot, does not lie); enqueue-only + one-shot `status`; never touches pumps/scale |

Not present yet: sequence runner, multi-pump parallel dispense, NVS, Wi-Fi/HTTP, I2C/PCA9685, cleaning, inventory, recipes.

## Safety model (this PR)

- **Safe boot:** `PumpBus::begin()` drives STBY **low** first, then parks every channel IN1/IN2 low with PWM off, before the driver can move anything.
- **STBY on demand:** STBY is raised only while a channel is actively running and dropped again on `stopAll()` / last stop — extra hardware-level disable when idle.
- **Distributed cutoff refusal:** `PumpBus` holds a reference to `MachineInputs`; `run()` refuses and `tick()` calls `stopAll()` when the cutoff reads open. With the stub, cutoff is always closed, so this path is dormant until the GPIO is wired.
- **Software cutoff reaction:** worst-case latency is one control period (~5 ms): `MachineInputs::tick()` → `PumpBus::tick()` → `stopAll()`. The hardware rocker on the 12 V pump VM is instantaneous and remains the real disable (docs/16).
- **STBY pull-down:** add an external 10 kΩ resistor from STBY (GPIO 17) to GND. During the pre-`begin()` boot window the GPIO floats; the pull-down holds the TB6612 disabled until firmware asserts the pin.

## Pin reference (`include/config.h`, copied from bench-rig)

| TB6612 pin | ESP32-S3 GPIO | Function |
| ---------- | ------------- | -------- |
| AIN1 | 4 | Pump 1 direction |
| AIN2 | 5 | Pump 1 direction |
| PWMA | 6 | Pump 1 PWM |
| BIN1 | 7 | Pump 2 direction |
| BIN2 | 15 | Pump 2 direction |
| PWMB | 16 | Pump 2 PWM |
| STBY | 17 | Driver enable (HIGH = active) |
| VM | 12 V pump bus | Through hardware cutoff switch |
| VCC / GND | 3.3 V / GND | Logic / common ground |

Cutoff sense (`pins::kCutoffSense`) is `-1` (not wired). HX711 uses GPIO 1 (`kScaleDout`) and GPIO 2 (`kScaleSck`).

## Build and flash

Requires [PlatformIO](https://platformio.org/). Uses **USB CDC on boot** — flash via the DevKit native USB port.

```bash
cd firmware/controller
pio run -e esp32-s3-devkitc-1
pio run -e esp32-s3-devkitc-1 -t upload
```

**N16R8 module:** use the default `esp32-s3-devkitc-1` board profile (8 MB flash); a 16 MB/PSRAM profile caused a boot loop on bench (see bench-rig notes).

## Unit tests

```bash
cd firmware/controller
pio test -e native   # or plain `pio test` (ESP32 env skips host-only suites)
```

Runs host-side Unity tests with no hardware (**74 cases** total). Note the scope: the
native build compiles `PumpChannel` / `PumpBus` / `ScalePlatform` / `Coordinator` /
`command_validate` only. `CommandQueue`, `SerialTransport`, `StatusPublisher`, and `ControlTask` are
**not host-tested** (FreeRTOS / Arduino `Serial` dependencies) — they are
bench-verified on hardware. The command-queue busy/drain semantics and the serial
parser preflight is host-tested via `test_command_validate`; queue flush-on-cancel is bench-verified.

- **`test_pump_bus`** (10 tests): channel-bounds rejection, run-before-begin refusal, fail-unsafe cutoff, cutoff refusal + STBY behavior, STBY lifecycle across multi-channel run/stop, direction truth table, safe-boot ordering, and duty clamping. Enabled by the `GpioOps` seam injected into `PumpChannel::begin()` and `PumpBus::begin()`.
- **`test_scale_platform`** (16 tests): rolling filter average, flow-gate consecutive threshold, sub-threshold no-detect, flow timeout elapsed (non-blocking, scripted `now_ms`), tare FSM completing over multiple `tick()` calls, `ready()=false` when the backend fails to initialize, skipping conversions when the backend is not ready, flow timeout firing with no successful conversion at all, mutual exclusion between `flowDetected()`/`flowTimedOut()` (whichever latches first blocks the other), rolling-filter eviction of the oldest sample once the ring is full, stale/liveness `ready()` going false after `kScaleStaleTimeoutMs` and recovering on the tick after reads resume, `setFlowConfig` clamping a negative threshold and a sub-1 consecutive count so flat weights never spuriously trigger flow, `setCalibrationFactor` forwarding to the backend, and null/missing `ScaleOps` members leaving `ready()==false` without crashing. Enabled by the `ScaleOps` seam injected into `ScalePlatform::begin()`.
- **`test_coordinator`** (22 tests): dispense FSM against real `PumpBus` + `ScalePlatform` fakes; timed/flow-gated pours, cancel, busy/cutoff/ml rejects, rollover-safe deadlines, `lastReject()` on failure paths.
- **`test_command_validate`** (28 tests): line parse, preflight rejects (cutoff, pour ceiling, sub-resolution ml), Marlin wire strings, `jobRejectText`.

The cutoff-refusal path (confirming `run()` returns false and STBY is never raised) is covered in the native tests via `MachineInputs::setCutoffOpen(true)` — no pin wiring needed. The scale tests feed scripted gram/raw sequences through a fake `ScaleOps`, so no bogde/HX711 library or wiring is involved.

## Scale subsystem (`ScalePlatform` / HX711)

Non-blocking port of the bench `ScaleDriver` to the `ControlTask` tick (docs/16: no `wait_ready_timeout` loops or `delay()` after `setup()`).

- **`begin(backend)`** — loads `config.h` defaults, `set_scale(...)`, one bounded HX711 `wait_ready` (`kScaleBeginTimeoutMs`); the only place a blocking wait is allowed.
- **`tick(now_ms)`** — at most one HX711 conversion when the backend `isReady()`; advances the sampling / tare FSM. `now_ms` is `millis()` for flow-timeout timing. Never blocks.
- **`tare()`** — arms a multi-tick tare; averages `kScaleFilterReads` raw samples across ticks and applies `set_offset(...)` without stalling the control loop.
- **`readGrams()` / `readFilteredGrams()`** — cached last sample / rolling average; sampling happens in `tick()`.
- **Flow gate** (distributed safety, docs/16): `resetFlowDetect(now_ms)` arms the gate and starts the timeout clock; `flowDetected()` latches after `flowDetectConsecutive` sample-to-sample deltas above `flowThresholdG`; `flowTimedOut()` latches when the timeout elapses without flow. Same defaults as bench-rig. There is intentionally **no** blocking `waitForFlow()` in product code.
  - **Sample cadence when tuning (Test 9):** flow deltas advance only on a *successful* HX711 conversion (~10–20 ms apart, HX711-rate-limited), not on every 5 ms `ControlTask` tick — the same effective rate as the bench rig's 15 ms poll. So `flowDetectConsecutive` counts conversions, not ticks; keep that in mind when tuning `flowThresholdG`/`flowDetectConsecutive` against Test 9 (docs/06). The `flowTimedOut()` clock is independent — it runs off `now_ms` and fires even if conversions stall.
- **Config:** `setCalibrationFactor(...)`, `setFlowConfig(threshold, consecutive, timeout)`; introspection via `ready()`, `lastDeltaG()`, `flowDetectTimeoutMs()`, etc.
- **Liveness:** `ready()` reflects `initialized_ && !stale_` — it goes false if no successful conversion occurs within `kScaleStaleTimeoutMs`, and recovers on the tick after reads resume, so a dead sensor is visible in the status snapshot; the no-flow timeout still fires from the wall clock even without a conversion.

All HX711 I/O lives behind the injected `ScaleOps` (see `scale_ops.h`); the real bogde/HX711 wiring is in `control_task.cpp` (ESP32 path only, excluded from the native build). The scale is ticked after `pumps_.tick()` and its `ready` / filtered `grams` / `flow_detected` / `flow_timed_out` / `last_delta_g` are published in the status snapshot.

**Deferred:** glass-present detection is not implemented — the mass thresholds/heuristic are still open (docs/16), so callers get raw filtered grams and decide policy later.

## Dispense subsystem (Coordinator + CommandQueue + SerialTransport)

Single-pump, non-blocking, gated timed dispense (docs/16 dispense step). The
coordinator runs at most one job, advanced each `ControlTask` tick — there is no
blocking `delay()` or busy-wait on the motion path.

Dispense sub-FSM (advanced in `Coordinator::tick(now_ms)`):

```text
startDispense -> preconditions (cutoff closed, valid channel, ml > 0)
             -> flow_gate && scale.ready() ? FlowWait : Pour (timed from motor-on)
FlowWait -> flowDetected()  -> Pour (pour timer starts at flow onset)
         -> flowTimedOut() OR scale not ready -> abort (error), stopAll
Pour     -> now >= deadline (ml / ml_per_s) -> AntiDrip (reverse)
AntiDrip -> now >= anti-drip deadline -> success, stopAll
cancel   -> stopAll immediately, clear job (no anti-drip, no success flag)
```

Calibration constants live in `include/config.h`, copied from the bench rig:

- `kDefaultMlPerSecond = 1.75` — open-loop pour rate; pour ms = `(ml / ml_per_s) * 1000`.
- `kDefaultAntiDripMs = 100` — reverse purge after each pour.

Safety ceilings (the coordinator **rejects**, never silently clamps, so the
operator never gets a wrong volume without notice):

- `kMaxDispenseMl = 500` — absurd/oversized volumes are refused up front.
- `kMaxPourDurationMs = 120000` — hard pump-on ceiling; a request whose computed
  pour exceeds it is refused (guards against mis-calibration blowing up the timer).
- Non-finite (NaN/Inf) and sub-resolution (pour rounds to 0 ms) volumes are refused.

### Documented v1 defaults / policy

- **Cancel aborts immediately** — `stopAll()`, no anti-drip reverse, result is neither ok nor error.
- **Scale not ready at start** → timed-from-motor-on (no flow gate), even when `flow_gate` was requested.
- **Scale goes not-ready during flow wait** → abort the pour (before the no-flow timeout can fire).
- **No glass-present check** — mass/glass heuristics are still open (docs/16); the coordinator does not gate on a glass.
- **`ml_per_s` from the config constant** — per-pump NVS calibration is deferred to the NVS subsystem.
- **Cutoff open** at start rejects the job; cutoff opening mid-job aborts it (one control period latency, docs/16).

### Bench serial (Marlin-style, enqueue-only)

`SerialTransport` is polled non-blocking from `ControlTask::tick()` at 115200 baud. Pump numbers are **1-based** on the wire (pump 1 → channel 0).

| Wire | Meaning |
| ---- | ------- |
| `ok` | Command accepted into the depth-1 queue (not pour complete) |
| `busy` | Coordinator busy or queue slot full |
| `Error:...` | Parse or preflight reject |
| `// job:ok` | Pour finished successfully (async) |
| `// job:error reject=<code>` | Pour failed or rejected at drain (async) |

| Command | Effect |
| ------- | ------ |
| `dispense <pump> <ml>` | Flow-gated dispense (falls back to timed if scale not ready) |
| `dispense open <pump> <ml>` | Timed-from-motor-on dispense (no flow gate) |
| `cancel` / `stop` | Abort current job; **flushes** a pending queued dispense |
| `status` | Print latest snapshot (`job_reject=` uses text codes) |

Example:

```text
dispense 1 30
ok
// job:ok
```

`ok` means queued, not poured. Poll `status` or wait for `// job:` lines. Preflight rejects cutoff-open, pour-too-long, and sub-resolution ml before enqueue. `cancel` then `dispense` in one serial burst is supported.

Do **not** add motor calls outside `PumpChannel` / `PumpBus`, and keep transports enqueue-only.

The scale still has no dedicated serial calibration path here; to bench-verify the HX711 on an N16R8 (GPIO 1/2), compare `status` `grams=` against the bench-rig `scale` / `weight` commands with the same known mass — the filtered grams should track within the rolling-filter tolerance.

## Next subsystems to implement (order)

1. ~~**Command queue**~~ — done (depth 1, cancel-first drain, busy on duplicate dispense).
2. ~~**Coordinator**~~ — done for single-pump gated timed dispense; multi-pump parallel still deferred.
3. **NVS config** — bindings + calibration load/save via PersistTask / idle hook (replace the `config.h` `ml_per_s` / anti-drip constants with per-pump values).
4. **Sequence runner** — sequential + parallel dispense steps; manual pour as single-step job.
5. **Wi-Fi HTTP** — enqueue only; status snapshot poll. **Prerequisites (tracked, deferred with HTTP):** (a) make `CommandQueue::cancel_pending_` a `std::atomic<bool>` with `exchange()` — a `volatile` flag can drop a cancel once a Core-0 producer exists (a dropped stop is a spill); (b) implement `StatusPublisher` tear-free read (seqlock / double-buffer) before a second task reads the snapshot; (c) decide the wire contract for reject-on-busy vs. rejection reporting.
6. **Cleaning sequences**, then **I2C pump modules** (PCA9685 + TB6612).
