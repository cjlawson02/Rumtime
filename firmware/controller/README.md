# Controller Firmware

Product firmware for **ESP32-S3-DevKitC-1** (Arduino / PlatformIO), implementing the locked runtime model in [`docs/16-firmware-and-software-architecture.md`](../../docs/16-firmware-and-software-architecture.md): a fixed-period **`ControlTask`** on Core 1 that is the sole owner of motor outputs, with distributed safety (each subsystem refuses unsafe work).

The **pump**, **scale**, **command queue**, **coordinator** (single-pump gated timed dispense), **sequence runner** (sequential multi-ingredient pours), **NVS machine config** (per-pump calibration + bindings), **inventory** (primed / remaining ml per ingredient), **enqueue-only serial** transport, and **Wi-Fi HTTP** (kiosk device API) are implemented. Multi-pump parallel and I2C modules remain deferred. The blocking-serial bench rig in [`firmware/bench-rig/`](../bench-rig/) stays as bring-up reference and is unchanged.

## Implemented vs stub

| Component | File(s) | State |
| --------- | ------- | ----- |
| `PumpChannel` | `pump_channel.{h,cpp}` | **Implemented** — one TB6612 channel (IN1/IN2/PWM); sole GPIO writer for its motor outputs; injected `GpioOps` seam enables host-side unit tests |
| `PumpBus` | `pump_bus.{h,cpp}` | **Implemented** — owns STBY + 2 channels; `run`/`stop`/`stopAll`; refuses `run()` and forces `stopAll()` when cutoff open; fails UNSAFE when uninitialized; configures direction/PWM before raising STBY; clamps duty |
| `ScalePlatform` | `scale_platform.{h,cpp}` | **Implemented** — non-blocking HX711 FSM; one conversion per `tick()`, multi-tick tare, rolling filter, flow-gate + no-flow timeout flags; injected `ScaleOps` seam enables host-side unit tests |
| `ControlTask` | `control_task.{h,cpp}` | **Implemented** — 5 ms `vTaskDelayUntil` loop; queue drain, coordinator, sequence runner, idle NVS commit, status publish, serial poll; TWDT feed each tick |
| `MachineInputs` | `machine_inputs.{h,cpp}` | **Deferred for v1** — optional GPIO tap of the same VM rocker (`kCutoffSense = -1`). One hardware rocker is enough; firmware does not need a sense line on the bench |
| `Coordinator` | `coordinator.{h,cpp}` | **Implemented** — one job at a time; non-blocking single-pump gated timed dispense sub-FSM advanced in `tick(now_ms)`; continuous forward **prime** with operator stop and 60 s safety cutoff; drives `PumpBus` + `ScalePlatform` only (no direct GPIO). Multi-pump parallel still deferred |
| `SequenceRunner` | `sequence_runner.{h,cpp}` | **Implemented** — sequential multi-step pours (`ingredient_id` + `ml`); resolves pumps via `ConfigStore::channelForIngredient`; each step runs through the coordinator flow-gated dispense FSM; max **16** steps per sequence; parallel groups still deferred |
| `CommandQueue` | `command_queue.{h,cpp}` + `queue_ops.h` | **Implemented (host-tested)** — depth-1 queue policy + `QueueOps` seam (FreeRTOS on ESP32, in-memory fake on host); `std::atomic` cancel; `markCommandAfterCancel()` preserves a command enqueued in the same poll as `cancel` |
| `StatusPublisher` | `status_snapshot.{h,cpp}` | **Implemented (host-tested)** — seqlock publish/read; carries `command_pending`, `job_cancelled`, config persist status |
| `SerialTransport` | `serial_transport.{h,cpp}` | **Implemented (bench-verified)** — capped bytes/poll; pour calibration at enqueue; config/inventory ops via `ConfigOpQueue`; Wi-Fi provisioning commands; rejects config edits when queue pending or job busy |
| `ConfigStore` | `config_store.{h,cpp}` | **Implemented** — RAM-authoritative per-pump calibration + ingredient bindings, persisted as one versioned NVS blob |
| `InventoryStore` | `inventory_store.{h,cpp}` | **Implemented** — per-ingredient `remaining_ml`, `bottle_size_ml`, `primed`; parallel NVS blob; seeds on bind; subtract per completed pour step |
| `ConfigOpQueue` | `config_op_queue.{h,cpp}` | **Implemented (host-tested)** — depth-1 cross-task queue; HTTP (Core 0) enqueues; ControlTask drains and applies RAM mutations |
| `DeviceStatus` mapper | `device_status.{h,cpp}` | **Implemented (host-tested)** — `GET /status` JSON matching kiosk `deviceStatusSchema` |
| `HttpServer` | `http_server.{h,cpp}` | **Implemented** — Arduino `WebServer` + ArduinoJson v7 on Core 0; enqueue-only handlers; CORS `*` for LAN dev |
| `WiFiManager` | `wifi_manager.{h,cpp}` | **Implemented** — STA-only; serial provisioning; mDNS `rumtime.local`; reconnect on disconnect |

Not present yet: multi-pump parallel dispense, I2C/PCA9685, cleaning sequences, soft-AP captive portal.

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

Cutoff: one **hardware rocker on pump VM** is the real disable. Optional `pins::kCutoffSense` GPIO (aux pole of the same switch) is **not used on v1 bench** — leave at `-1`. HX711 uses GPIO 1 (`kScaleDout`) and GPIO 2 (`kScaleSck`).

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

Runs host-side Unity tests with no hardware (**175 cases** total). Native build includes mapping/validation layers; `SerialTransport`, `ControlTask`, and ESP32 network code remain bench-verified on hardware.

- **`test_device_status`** (12 tests): idle `job`/`pumpJob` null, sequence pouring progress, verify `pumpJob`, job terminal latch, prime `pumpJob`, published bindings, notifications, config apply failure, config-op queue, binding seeds inventory, calibration preflight 422, HTTP status codes.

- **`test_pump_bus`** (10 tests): channel-bounds rejection, run-before-begin refusal, fail-unsafe cutoff, cutoff refusal + STBY behavior, STBY lifecycle across multi-channel run/stop, direction truth table, safe-boot ordering, and duty clamping. Enabled by the `GpioOps` seam injected into `PumpChannel::begin()` and `PumpBus::begin()`.
- **`test_scale_platform`** (16 tests): rolling filter average, flow-gate consecutive threshold, sub-threshold no-detect, flow timeout elapsed (non-blocking, scripted `now_ms`), tare FSM completing over multiple `tick()` calls, `ready()=false` when the backend fails to initialize, skipping conversions when the backend is not ready, flow timeout firing with no successful conversion at all, mutual exclusion between `flowDetected()`/`flowTimedOut()` (whichever latches first blocks the other), rolling-filter eviction of the oldest sample once the ring is full, stale/liveness `ready()` going false after `kScaleStaleTimeoutMs` and recovering on the tick after reads resume, `setFlowConfig` clamping a negative threshold and a sub-1 consecutive count so flat weights never spuriously trigger flow, `setCalibrationFactor` forwarding to the backend, and null/missing `ScaleOps` members leaving `ready()==false` without crashing. Enabled by the `ScaleOps` seam injected into `ScalePlatform::begin()`.
- **`test_coordinator`** (30 tests): dispense FSM against real `PumpBus` + `ScalePlatform` fakes with `ConfigStore`; timed/flow-gated pours, custom per-pump `ml_per_s` / `anti_drip_ms`, mid-pour cal isolation, cancel, busy/cutoff/ml rejects, rollover-safe deadlines, `lastReject()` on failure paths, continuous **prime** (forward run, operator stop without anti-drip, 60 s timeout, cancel abort).
- **`test_command_validate`** — line parse, dispense/prime/**pour** preflight, aggregate sequence caps, Marlin wire strings, `jobRejectText`, config-op parse + reject paths.
- **`test_config_store`** (17 tests): default seeding, calibration/bindings, duplicate-bind rejection, load sanitization, commit round trip, schema guards.
- **`test_sequence_runner`** (11 tests): 2-step success, unbound ingredient, step-2 failure, cancel, busy, flow-gate, binding resolution, job-status priority after sequence, config snapshot at start, `clearTerminalResult` before coordinator job.

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
             -> flow_gate ? FlowWait (scale must be ready at start) : Pour (timed from motor-on)
FlowWait -> flowDetected()  -> Pour (pour timer starts at flow onset)
         -> flowTimedOut() OR scale not ready -> abort (error), stopAll
Pour     -> now >= deadline (ml / ml_per_s) -> AntiDrip (reverse)
AntiDrip -> now >= anti-drip deadline -> success, stopAll
cancel   -> stopAll immediately, clear job (no anti-drip, no success flag)

Continuous prime sub-FSM (advanced in `Coordinator::tick(now_ms)`):

```text
startPrime -> preconditions (cutoff closed, valid channel)
          -> pump forward, phase kPrime (no scale, no pour timer)
tick     -> elapsed >= kMaxPrimeDurationMs (60 s) -> error (prime-timeout), stopAll
stopPrime -> operator stop: success, stopAll (no anti-drip)
cancel   -> stopAll immediately, clear job (no anti-drip, job cancelled)
```

Per-pump calibration comes from `ConfigStore` (NVS); the `config.h` constants are only
the **seed defaults** a fresh/reset record is initialized with:

- `kDefaultMlPerSecond = 1.75` — open-loop pour rate; pour ms = `(ml / ml_per_s) * 1000`.
- `kDefaultAntiDripMs = 100` — reverse purge after each pour.

At `startDispense()` the coordinator captures the channel's `ml_per_s` and `anti_drip_ms`
from `ConfigStore`, so editing calibration mid-pour does not change the running job.

Safety ceilings (the coordinator **rejects**, never silently clamps, so the
operator never gets a wrong volume without notice):

- `kMaxDispenseMl = 500` — absurd/oversized volumes are refused up front.
- `kMaxPourDurationMs = 120000` — hard pump-on ceiling; a request whose computed
  pour exceeds it is refused (guards against mis-calibration blowing up the timer).
- `kMaxSequenceTotalMl = kMaxDispenseMl` — aggregate pumped ml across all steps in
  one recipe pour (blocks pathological 16-step totals).
- `kMaxSequenceDurationMs = kMaxPourDurationMs` — aggregate sequential pump-on time
  across all steps in one recipe pour.
- `kMaxPrimeDurationMs = 60000` — continuous-prime safety cutoff (separate from pour max).
- Non-finite (NaN/Inf) and sub-resolution (pour rounds to 0 ms) volumes are refused.

### Documented v1 defaults / policy

- **Cancel aborts immediately** — `stopAll()`, no anti-drip reverse, emits `// job:cancelled` (not ok or error).
- **Scale not ready at start** → `dispense` (flow-gated) is rejected with `Error:scale not ready`. Use `dispense open` for timed pour without the scale.
- **Scale goes not-ready during flow wait** → abort the pour (before the no-flow timeout can fire).
- **No glass-present check** — mass/glass heuristics are still open (docs/16); the coordinator does not gate on a glass.
- **`ml_per_s` / `anti_drip_ms` per pump from NVS** (`ConfigStore`); the `config.h` values are seed defaults only.
- **Cutoff open** at start rejects the job; cutoff opening mid-job aborts it (one control period latency, docs/16).

### Bench serial (Marlin-style, enqueue-only)

`SerialTransport` is polled non-blocking from `ControlTask::tick()` at 115200 baud. Pump numbers are **1-based** on the wire (pump 1 → channel 0).

| Wire | Meaning |
| ---- | ------- |
| `ok` | Dispense accepted into the depth-1 queue; **or** config edit accepted into RAM (not flash-confirmed) |
| `busy` | Coordinator busy or queue slot full |
| `Error:...` | Parse or preflight reject |
| `// job:ok` | Pour finished successfully (async) |
| `// job:error reject=<code>` | Pour failed or rejected at drain (async) |
| `// job:cancelled` | Pour aborted by operator cancel (async) |
| `// config:error persist failed` | Idle NVS commit failed (async; retry with 1 s backoff) |

| Command | Effect |
| ------- | ------ |
| `dispense <pump> <ml>` | Flow-gated dispense (requires scale ready) |
| `dispense open <pump> <ml>` | Timed-from-motor-on dispense (no scale / flow gate) |
| `pour <ingredient> <ml> [<ingredient> <ml> ...]` | Flow-gated multi-step recipe pour (max 16 steps; ingredient → pump via NVS bindings). Bindings + calibration are **snapshotted at sequence start** (not re-read per step). HTTP is the production transport for multi-step recipes; serial is bench/debug (`kLineMax = 512`). |
| `prime <pump>` | Continuous forward prime (no scale; operator stops with `prime stop`) |
| `prime stop` | Operator stop during prime — job ok, pump off, **no anti-drip** |
| `cancel` / `stop` | Abort current job; **flushes** a pending queued command |
| `status` | Print latest snapshot (`job_reject=`, `config_dirty=`, `config_persist_error=`) |
| `cal <pump> <ml_per_s> [anti_drip_ms]` | Set per-pump calibration in NVS (anti-drip kept if omitted) |
| `bind <pump> <ingredient>` | Bind an ingredient id to a pump in NVS |
| `unbind <pump>` | Clear a pump binding |
| `config` | Print per-pump calibration + bindings |

Config edits (`cal`/`bind`/`unbind`) and inventory ops enqueue on **`ConfigOpQueue`** (same busy gates as HTTP). **`ok` does not mean persisted** — poll `status` for `config_dirty=0` or watch for `// config:error persist failed`.

### Wi-Fi serial provisioning (STA-only)

Credentials live in NVS (`wifi_ssid` / `wifi_pass`, separate from machine config). mDNS hostname: **`rumtime.local`**.

| Command | Effect |
| ------- | ------ |
| `wifi status` | Print connected, SSID, IP, RSSI, hostname |
| `wifi ssid <ssid>` | Stage SSID (RAM) |
| `wifi pass <password>` | Stage password (RAM) |
| `wifi save` | Persist credentials + connect |
| `wifi clear` | Wipe credentials and disconnect |

### HTTP device API (kiosk contract)

Library: **ArduinoJson v7** + Arduino **`WebServer`** on **Core 0** (`NetworkTask`, priority 4). Port **80**. Handlers: parse JSON → validate → read status snapshot → enqueue → return. **No GPIO, pumps, or NVS writes in handlers.**

Base: `http://rumtime.local` (or device IP). Contract: [`docs/18-kiosk-device-api.md`](../../docs/18-kiosk-device-api.md) and kiosk Zod schemas in `ui/kiosk/src/api/types.ts`.

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/status` | Kiosk `DeviceStatus` JSON |
| POST | `/pour` | `{ recipeId, steps[] }` → sequence runner |
| POST | `/pour/cancel` | Cancel current job |
| POST | `/pour/ack` | 204 no-op (prompt steps deferred) |
| POST | `/pumps/dispense` | `prime` / `verify` / `calibration` |
| POST | `/pumps/dispense/cancel` | `prime stop` or cancel |
| POST | `/pumps/binding` | Bind/clear ingredient on pump |
| POST | `/pumps/calibration` | Per-pump calibration |
| POST | `/inventory/refill` | Refill to bottle size |
| POST | `/inventory/bottle-size` | Set bottle size ml |
| POST | `/inventory/level` | Set remaining ml |
| POST | `/inventory/primed` | Set primed flag |

**HTTP errors (locked):**

| Condition | HTTP | JSON `error` |
| --------- | ---- | ------------- |
| Queue full / job busy | 409 | `busy` |
| Cutoff open | 503 | `unsafe` |
| Validation reject | 422 | e.g. `bad_pump`, `not_primed`, `low_inventory` |
| Accepted command | 204 | (empty body) |
| Malformed JSON | 400 | `bad_request` |
| Cleaning purposes | 501 | `not_implemented` |

Guest recipe pours require **`primed: true`** and `remaining_ml >= step_ml + 10` (kiosk reserve) or preflight returns **422**.

Dispense preflight uses the **target pump's** `ml_per_s` from `ConfigStore` (not the
seed default), so pour-ceiling rejects match what the coordinator will enforce. `pour`
captures bindings + calibration at **sequence start** (same policy as `dispense` at enqueue).

Example (dispense):

```text
dispense 1 30
ok
// job:ok
```

Example (multi-step pour):

```text
bind 1 bourbon
ok
bind 2 simple
ok
pour bourbon 30 simple 15
ok
// job:ok
```

Unbound ingredient (no motion):

```text
pour rye 30
Error:bad ingredient
```

Cancel mid-sequence:

```text
pour bourbon 30 simple 15
ok
cancel
ok
// job:cancelled
```

Example (prime):

```text
prime 1
ok
prime stop
ok
// job:ok
```

Emergency abort during prime (no anti-drip, job cancelled):

```text
prime 1
ok
stop
ok
// job:cancelled
```

Example (calibration persist):

```text
cal 1 2.0
ok
status
# ... config_dirty=1 ...   (commit pending)
# wait ~1 s idle
status
# ... config_dirty=0 config_persist_error=0 ...
config
# pump=1 ml_per_s=2.000 ...
```

`ok` on `dispense` means queued, not poured. Poll `status` or wait for `// job:` lines.
Preflight rejects cutoff-open, pour-too-long (per-pump rate), and sub-resolution ml
before enqueue. `cancel` then `dispense` in one serial burst is supported.

Do **not** add motor calls outside `PumpChannel` / `PumpBus`. Keep **dispense**
enqueue-only through `CommandQueue`; config edits are the documented exception until
HTTP lands with proper cross-task routing.

The scale still has no dedicated serial calibration path here; to bench-verify the HX711 on an N16R8 (GPIO 1/2), compare `status` `grams=` against the bench-rig `scale` / `weight` commands with the same known mass — the filtered grams should track within the rolling-filter tolerance.

## Machine config subsystem (ConfigStore + NVS)

Per-pump calibration and ingredient bindings persist in ESP32 **NVS** (docs/16 "Machine
config (NVS)"), replacing the old `config.h` `ml_per_s` / anti-drip constants with
per-pump values. `RAM is session-authoritative`; the flash write is deferred to idle.

- **Record:** one blob (`ConfigRecord`, 584 bytes) = `magic` + schema `version` +
  `num_pumps` + `PumpConfig[kMaxPumps]` (`ml_per_s`, `anti_drip_ms`, `bound`,
  `ingredient_id`). Layout is locked with `static_assert` — bump
  `kConfigSchemaVersion` on breaking changes (reset-only migration for v1). The record
  is sized to the documented `pump_id 1..16` domain so adding I2C pump modules
  (phase 7) does not force a schema reset. The coordinator still only addresses the two
  real channels.
- **Load / reset:** `begin()` reads the blob and validates `magic` + `version` +
  `num_pumps` + exact byte length; any mismatch resets to `config.h` seed defaults and
  marks dirty. A header-valid blob still runs **per-field sanitization** on every pump
  (finite `ml_per_s` in `[kMinMlPerSecond, kMaxMlPerSecond]`, `anti_drip_ms <=
  kMaxAntiDripMs`, valid binding strings); corrupt fields reset to seed defaults and
  mark dirty. Accessors (`mlPerSecond`, `antiDripMs`) clamp as defense-in-depth.
- **Mutate (RAM only):** `setCalibration` / `setBinding` / `clearBinding` validate and
  set `dirty()`. `setBinding` rejects duplicate ingredient ids on different pumps.
  `setCalibration` rejects non-finite / out-of-range rates and anti-drip above
  `kMaxAntiDripMs` (an unbounded reverse purge is a spill risk).
- **Commit (flash):** `commit()` is the **only** NVS write and runs **only when idle**
  (`ControlTask` hook, never during a pour — implementation rule 8). TWDT is fed
  before and after the blocking `putBytes`. On failure, `dirty_` stays true, retries
  at most once per `kConfigCommitRetryMs` (1 s), and `// config:error persist failed`
  is emitted once per failure episode. `status` exposes `config_dirty` and
  `config_persist_error`. A dedicated `PersistTask` remains deferred (docs/16).
- **Seam:** all NVS I/O is behind the injected `NvsOps` (see `config_store.h`); native
  tests use an in-memory fake, the ESP32 build wires Arduino `Preferences` in
  `control_task.cpp` (sole NVS I/O site; `putBytes` is the flash write).

**Inventory:** separate NVS blob (`inv` key). Binds seed `remaining_ml = bottle_size_ml`, `primed = false`. Each completed pour step subtracts ml in RAM; idle commit persists.

## Next subsystems to implement (order)

1. ~~**Command queue**~~ — done.
2. ~~**Coordinator**~~ — done (single-pump); multi-pump parallel still deferred.
3. ~~**NVS config**~~ — done.
4. ~~**Sequence runner**~~ — done (sequential pours).
5. ~~**Wi-Fi HTTP**~~ — done: STA + mDNS + kiosk HTTP API + inventory + cross-task config queue.
6. **Cleaning sequences**, then **I2C pump modules** (PCA9685 + TB6612).
