# Controller Firmware

Product firmware for **ESP32-S3-DevKitC-1** (Arduino / PlatformIO), implementing the locked runtime model in [`docs/16-firmware-and-software-architecture.md`](../../docs/16-firmware-and-software-architecture.md): a fixed-period **`ControlTask`** on Core 1 that is the sole owner of motor outputs, with distributed safety (each subsystem refuses unsafe work).

The **pump** (I2C MCP23017 modules), **scale**, **command queue**, **coordinator** (single-pump gated timed dispense), **sequence runner** (parallel phases), **NVS machine config** (per-pump calibration + bindings), **inventory** (primed / remaining ml per ingredient), **enqueue-only serial** transport, and **Wi-Fi HTTP** (kiosk device API) are implemented. The blocking-serial bench rig in [`firmware/bench-rig/`](../bench-rig/) stays as Pololu GPIO bring-up reference and is unchanged.

## Implemented vs stub

| Component | File(s) | State |
| --------- | ------- | ----- |
| `PumpModule` / `PumpBus` | `pump_module.*`, `pump_bus.*` | **Implemented** — MCP23017 GPA IN1/IN2 (PWM strapped on PCB); probes 0x20–0x23; STBY = `PUMP_BUS_ENABLE`; up to 16 channels; soft concurrency ceiling `kMaxConcurrentPumps` (6); per-pump polarity from NVS (seed `kDefaultInvertMotorPolarity`); OLATA written before IODIRA and IODIRA re-asserted on every write; one retry per write, any failed write → `stopAll()` (STBY low); STBY refused while a module is faulted; idle `rescan()` every `kPumpModuleRescanMs` for hot-plug / reset recovery; `I2cOps` + `GpioOps` seams |
| `ScalePlatform` | `scale_platform.{h,cpp}` | **Implemented** — non-blocking HX711 FSM; one conversion per `tick()`, multi-tick tare, rolling filter, flow-gate + no-flow timeout flags; injected `ScaleOps` seam enables host-side unit tests |
| `ControlTask` | `control_task.{h,cpp}` | **Implemented** — 5 ms `vTaskDelayUntil` loop; queue drain, coordinator, sequence runner, idle NVS commit (atomic config+inventory when both dirty), status publish, serial poll; TWDT feed each tick |
| `Coordinator` | `coordinator.{h,cpp}` | **Implemented** — one job at a time; non-blocking single-pump gated timed dispense sub-FSM advanced in `tick(now_ms)`; continuous forward **prime** with operator stop and 60 s prime timeout; drives `PumpBus` + `ScalePlatform` only (no direct GPIO). Parallel multi-pump within a pour phase is owned by `SequenceRunner`, not the coordinator |
| `SequenceRunner` | `sequence_runner.{h,cpp}` | **Implemented** — ordered pour **phases**; steps within a phase run concurrently (open-loop timed, ≤ `kMaxConcurrentPumps`); single-step phases use the coordinator flow-gated FSM; max **16** phases / **16** total steps |
| `CommandQueue` | `command_queue.{h,cpp}` + `queue_ops.h` | **Implemented (host-tested)** — depth-1 queue policy + `QueueOps` seam (FreeRTOS on ESP32, in-memory fake on host); `std::atomic` cancel; `markCommandAfterCancel()` preserves a command enqueued in the same poll as `cancel` |
| `StatusPublisher` | `status_snapshot.{h,cpp}` | **Implemented (host-tested)** — seqlock publish/read; carries `command_pending`, `job_cancelled`, config persist status |
| `SerialTransport` | `serial_transport.{h,cpp}` | **Implemented (bench-verified)** — capped bytes/poll; pour calibration at enqueue; config/inventory ops via `ConfigOpQueue`; Wi-Fi provisioning commands; rejects config edits when queue pending or job busy |
| `ConfigStore` | `config_store.{h,cpp}` | **Implemented** — RAM-authoritative per-pump calibration + ingredient bindings, persisted as one versioned NVS blob |
| `InventoryStore` | `inventory_store.{h,cpp}` | **Implemented** — per-ingredient `remaining_ml`, `bottle_size_ml`, `primed`; parallel NVS blob; seeds on bind; subtract per completed pour step |
| `ConfigOpQueue` | `config_op_queue.{h,cpp}` | **Implemented (host-tested)** — depth-1 cross-task queue; HTTP (Core 0) enqueues; ControlTask drains and applies RAM mutations |
| `DeviceStatus` mapper | `device_status.{h,cpp}` | **Implemented (host-tested)** — `GET /status` JSON matching kiosk `deviceStatusSchema` |
| `HttpServer` | `http_server.{h,cpp}` | **Implemented** — Arduino `WebServer` + ArduinoJson v7 on Core 0; enqueue-only handlers; HTTP preflight reads published snapshot rows only (no cross-core store access) |
| `WiFiManager` | `wifi_manager.{h,cpp}` | **Implemented** — STA-only; serial provisioning; mDNS `rumtime.local`; reconnect on disconnect; modem sleep off + max TX; **cancel busy jobs on STA drop** (`wifi_link_safety.h`) |

Not present yet: cleaning sequences, soft-AP captive portal.

## Safety model (this PR)

- **Safe boot:** `PumpBus::begin()` drives STBY **low** first, then probes modules and parks each MCP23017 OLATA at 0, before STBY can enable the bridges.
- **STBY on demand:** STBY is raised only while a channel is actively running and dropped again on `stopAll()` / last stop — extra hardware-level disable when idle.
- **Hardware stop:** the only hardware cutoff is **main power** (upstream of the 12 V supply). There is no separate pump-bus cutoff or GPIO sense line. Firmware does not know whether main power is on.
- **Software stop:** `stopAll()` and TB6612 **STBY** stop motion while power is present.
- **Wi-Fi lost while busy:** NetworkTask falling-edge on STA disconnect enqueues **cancel** (same path as HTTP/serial) when `job_busy`, `sequence_busy`, or `pumps_running`. Brief RF blips will abort a pour/prime — preferred over a runaway continuous prime when the kiosk cannot reach `/cancel`. The 60 s prime timeout remains a backup.
- **Kiosk HTTP heartbeat:** HTTP-started pour/prime/dispense **arms** a watchdog. `GET /status` (kiosk poll) refreshes activity. If no HTTP for `kKioskHeartbeatTimeoutMs` (3 s) while still busy → **cancel**. Serial-started jobs are not armed. Covers “Wi-Fi up, kiosk dead”; STA cancel remains the fast path for RF drop.
- **STBY pull-down:** add an external 10 kΩ resistor from STBY (GPIO 18 on the motherboard; bench was 17) to GND. During the pre-`begin()` boot window the GPIO floats; the pull-down holds the TB6612 disabled until firmware asserts the pin.

## Pin reference (`include/config.h`)

Motherboard pump path (I2C modules):

| Net | ESP32-S3 GPIO | Function |
| --- | ------------- | -------- |
| I2C SDA | 5 | Micro-Fit pin 5 → MCP23017 |
| I2C SCL | 4 | Micro-Fit pin 6 → MCP23017 |
| PUMP_BUS_ENABLE | 18 | Micro-Fit pin 3 → TB6612 STBY |

Legacy GPIO pump pins remain in `config.h` for the bench-rig tree only (11/12/14 and 16/8/15). Motherboard motors are I2C-only.

HX711 uses GPIO 6 (`kScaleDout`) and GPIO 7 (`kScaleSck`).

## Build and flash

Requires [PlatformIO](https://platformio.org/). Uses **USB CDC on boot** — flash via the DevKit native USB port.

Platform: official PlatformIO **espressif32@8.0.0** (Arduino-ESP32 **3.3.12** / IDF **5.5.5**).

```bash
cd firmware/controller
pio run -e esp32-s3-devkitc-1
pio run -e esp32-s3-devkitc-1 -t upload
```

**N16R8 module:** use the default `esp32-s3-devkitc-1` board profile (8 MB flash); a 16 MB/PSRAM profile caused a boot loop on bench (see bench-rig notes).

## USB and serial monitor

Firmware is built with **USB CDC on boot** — use the DevKit **native USB** port (shows as `/dev/cu.usbmodem*` on macOS).

### Recommended: `controllerctl.py` (host CLI)

PlatformIO monitor and copy-paste can mangle commands (unicode, `\r` quirks). Prefer the Python CLI:

```bash
cd firmware/controller
pip install -r requirements.txt
python3 scripts/controllerctl.py              # interactive (prompt: rumtime>)
python3 scripts/controllerctl.py status
python3 scripts/controllerctl.py wifi status
python3 scripts/controllerctl.py dispense open 1 30
python3 scripts/controllerctl.py pour bourbon 30 simple 15
```

Job commands (`dispense`, `pour`, `prime`, `cancel`) wait for async `// job:*` lines by default. Pass `--no-wait-job` for enqueue-only. Type `help` in the shell for the command list.

### Fallback: PlatformIO monitor

```bash
pio device monitor -e esp32-s3-devkitc-1
```

Open the monitor, then press **RST** on the board if you see no response or a boot loop. Automated serial scripts can put the S3 into USB download mode — use an open monitor + **RST** for interactive testing, or use `controllerctl.py`.

## Unit tests

```bash
cd firmware/controller
pio test -e native   # or plain `pio test` (ESP32 env skips host-only suites)
```

Runs host-side Unity tests with no hardware (**225 cases** total).

- **`test_device_status`** (12 tests): idle `job`/`pumpJob` null, sequence pouring progress, verify `pumpJob`, job terminal latch, prime `pumpJob`, published bindings, notifications, config apply failure, config-op queue, binding seeds inventory, calibration preflight 422, HTTP status codes.

- **`test_pump_bus`** (21 tests): I2C module probe/missing, channel bounds, STBY lifecycle, concurrency cap, direction + per-pump polarity, STBY-low-before-any-I2C ordering, OLAT-before-IODIR park, faulted module blocks STBY, stop/run write failures (retry, bus stop, no phantom pump), expander reset re-arm, idle rescan, second-module address 0x21. MCP23017/GPIO fakes are shared from `test/support/fake_pump_io.h`.
- **`test_scale_platform`** (16 tests): rolling filter average, flow-gate consecutive threshold, sub-threshold no-detect, flow timeout elapsed (non-blocking, scripted `now_ms`), tare FSM completing over multiple `tick()` calls, `ready()=false` when the backend fails to initialize, skipping conversions when the backend is not ready, flow timeout firing with no successful conversion at all, mutual exclusion between `flowDetected()`/`flowTimedOut()` (whichever latches first blocks the other), rolling-filter eviction of the oldest sample once the ring is full, stale/liveness `ready()` going false after `kScaleStaleTimeoutMs` and recovering on the tick after reads resume, `setFlowConfig` clamping a negative threshold and a sub-1 consecutive count so flat weights never spuriously trigger flow, `setCalibrationFactor` forwarding to the backend, and null/missing `ScaleOps` members leaving `ready()==false` without crashing. Enabled by the `ScaleOps` seam injected into `ScalePlatform::begin()`.
- **`test_coordinator`** (26 tests): dispense FSM against real `PumpBus` + `ScalePlatform` fakes with `ConfigStore`; timed/flow-gated pours (flow-wait capped at `min(pour_ms, kFlowDetectTimeoutMs)`), custom per-pump `ml_per_s` / `anti_drip_ms`, mid-pour cal isolation, cancel, busy/ml rejects, rollover-safe deadlines, `lastReject()` on failure paths, continuous **prime** (forward run, operator stop without anti-drip, 60 s timeout, cancel abort).
- **`test_command_validate`** — line parse, dispense/prime/**pour** preflight, aggregate sequence caps, Marlin wire strings, `jobRejectText`, config-op parse + reject paths.
- **`test_config_store`** (17 tests): default seeding, calibration/bindings, duplicate-bind rejection, load sanitization, commit round trip, schema guards.
- **`test_sequence_runner`** (11 tests): 2-step success, unbound ingredient, step-2 failure, cancel, busy, flow-gate, binding resolution, job-status priority after sequence, config snapshot at start, `clearTerminalResult` before coordinator job.

Boot probe: `begin()` reads `kScaleProbeReads` raw conversions; all-identical
(floating DOUT) or railed (open load cell) data leaves `ready()` false. DOUT gets
`INPUT_PULLUP` (bogde/HX711 leaves it floating on ESP32), so an absent HX711 reads
as never-ready rather than a 0 g scale.

Scale tests feed scripted gram/raw sequences through a fake `ScaleOps` — no bogde/HX711 library or wiring is involved.

## Stack budget

Both FreeRTOS tasks (ControlTask, NetworkTask) get 16 KiB (`config.h`). Measured
2026-11-19 after a serial `pour` + HTTP parallel `pour`: ~3.8 KB used (control),
~3.7 KB used (network). A `POST /pour` on the old layout overflowed the 8 KiB
network stack (stack-canary panic).

Rules that keep it that way:

- **No big structs on task stacks.** `StatusSnapshot` (~1.4 KB) lives in
  `ControlTask::snapshot_` / one network-task static (`StatusPublisher::read(out)`);
  `PourSequenceCommand` is stored flat (~0.5 KB, `addPhase()`/`addStep()`).
- **Compile-time cap:** the ESP32 env builds `src/` with `-Werror=stack-usage=1024`
  (per function; also rejects VLAs/`alloca`). Check frames with
  `PLATFORMIO_BUILD_SRC_FLAGS=-fstack-usage pio run -e esp32-s3-devkitc-1` and the
  `.su` files under `.pio/build/`.
- **Runtime check:** high-water marks are published as `GET /status`
  `link.stackFree.{control,network}` and `status` `stack_free_*`; below
  `kStackLowWaterBytes` (2 KiB) the controller prints `// stack:low …`. Re-measure
  after adding a deep path (it only sees paths that have actually run).
- **JSON:** every HTTP body parses with `NestingLimit(kHttpJsonNestingLimit)`.

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

All HX711 I/O lives behind the injected `ScaleOps` (see `scale_ops.h`); the real bogde/HX711 wiring is in `control_task.cpp` (ESP32 path only, excluded from the native build). The scale is ticked in the control loop and its `ready` / `glass_present` / filtered `grams` / `flow_detected` / `flow_timed_out` / `last_delta_g` are published in the status snapshot.

**Glass present (v1):** `ScalePlatform::glassPresent()` is true when the scale is ready, not taring, and filtered grams ≥ `kGlassPresentMinGrams` (50 g provisional). Recipe pours are rejected with `no_glass` when false. The hood ring light (`pins::kRingLight` = GPIO 13 → external MOSFET) tracks `glass_present` each control tick.

## Dispense subsystem (Coordinator + CommandQueue + SerialTransport)

Single-pump, non-blocking, gated timed dispense (docs/16 dispense step). The
coordinator runs at most one job, advanced each `ControlTask` tick — there is no
blocking `delay()` or busy-wait on the motion path.

Dispense sub-FSM (advanced in `Coordinator::tick(now_ms)`):

```text
startDispense -> preconditions (valid channel, ml > 0)
             -> flow_gate ? FlowWait (scale must be ready at start) : Pour (timed from motor-on)
FlowWait -> flowDetected()  -> Pour (pour timer starts at flow onset)
         -> flowTimedOut() OR scale not ready -> abort (error), stopAll
Pour     -> now >= deadline (ml / ml_per_s) -> AntiDrip (reverse)
AntiDrip -> now >= anti-drip deadline -> success, stopAll
cancel   -> stopAll immediately, clear job (no anti-drip, no success flag)

Continuous prime sub-FSM (advanced in `Coordinator::tick(now_ms)`):

```text
startPrime -> preconditions (valid channel)
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
- **Glass required for recipe pour** — HTTP/serial `pour` preflight and `SequenceRunner::start` both require `glassPresent()`; single-pump `dispense` / prime / flush are unchanged (setup path).
- **`ml_per_s` / `anti_drip_ms` per pump from NVS** (`ConfigStore`); the `config.h` values are seed defaults only.
- **Prime timeout** at 60 s (`kMaxPrimeDurationMs`) aborts continuous prime.

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
| `pol <pump> normal\|invert` | Per-pump motor polarity in NVS (swap IN1/IN2 for a pump wired M+/M− reversed) |
| `config` | Print per-pump calibration, polarity, module presence, bindings |

Pumps on an undetected module are left out of `GET /status` `pumps`, and dispense / prime / pour / `cal` / `bind` / `pol` on them are rejected (`unbind` stays allowed).

Config edits (`cal`/`bind`/`unbind`/`pol`) and inventory ops enqueue on **`ConfigOpQueue`** (same busy gates as HTTP). **`ok` does not mean persisted** — poll `status` for `config_dirty=0` or watch for `// config:error persist failed`.

### Wi-Fi serial provisioning (STA-only)

Credentials live in NVS (`wifi_ssid` / `wifi_pass`, separate from machine config). mDNS hostname: **`rumtime.local`**.

| Command | Effect |
| ------- | ------ |
| `wifi status` | Print connected, SSID, IP, RSSI, hostname |
| `wifi ssid <ssid>` | Stage SSID (RAM) |
| `wifi pass <password>` | Stage password (RAM) |
| `wifi save` | Persist credentials + connect |
| `wifi clear` | Wipe credentials and disconnect |

### Motherboard bring-up (no module required)

| Command | Effect |
| ------- | ------ |
| `led on` / `led off` | Drive `LED_STATUS` (GPIO 38). In normal running LED_STATUS blinks (250 ms on/off) while STBY is high and is off otherwise; a manual `led` setting holds while the drivers are off. |
| `scale-bypass on` / `scale-bypass off` | **Bench only, RAM only (cleared on reboot).** Pours skip scale-ready / glass checks and single-pump phases run timed (no flow gate). Serial-only; `busy` while a job runs; shown as `scale_bypass=1` in `status` and `"scaleBypass":true` in `GET /status`. |
| `stby on` / `stby off` | Force `PUMP_BUS_ENABLE` / TB6612 STBY (GPIO 18); probe J7–J10 pin 3. Replies `busy` while a job, queued command, or pump is running; `stby on` is refused while a pump module is faulted. |

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
| POST | `/pumps/dispense/cancel` | During prime → `prime stop` (ok); otherwise cancel. Idempotent. |
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
Preflight rejects pour-too-long (per-pump rate), sub-resolution ml, and config-op pending.
before enqueue. `cancel` then `dispense` in one serial burst is supported.

Do **not** add motor calls outside `PumpBus`. Keep **dispense**
enqueue-only through `CommandQueue`; config edits are the documented exception until
HTTP lands with proper cross-task routing.

The scale still has no dedicated serial calibration path here; to bench-verify the HX711 on an N16R8 (GPIO 6/7 on the motherboard; bench-rig still 8/9), compare `status` `grams=` against the bench-rig `scale` / `weight` commands with the same known mass — the filtered grams should track within the rolling-filter tolerance.

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
6. **Cleaning sequences**, then **I2C pump modules** (MCP23017 + TB6612).
