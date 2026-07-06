# Firmware and Software Architecture

Status: **runtime model locked** (2026-07-03). Software-stack and **firmware-internal** structure. HTTP/API surface still deferred.

## System context

```text
Cloudflare Pages (static kiosk UI)
    <-> Worker + KV (recipe catalog, menu metadata)

Kindle Fire (browser kiosk, home LAN)
    <-> Wi-Fi HTTP (JSON) directly to ESP32
        (not through Cloudflare for dispense/config)

ESP32-S3 product firmware
    -> I2C pump modules (up to four 4-pump cartridges, 16 pumps max)
    -> HX711 load cell
    -> hardware rocker on pump 12 V (VM)
    -> optional GPIO cutoff sense (software coherence only)
    -> optional local display / status LEDs
```

Recipes use **logical ingredient IDs** (for example `bourbon`, `blue_curacao`). The ESP32 stores those IDs as **opaque strings** — it does not know names, categories, or recipe structure. The kiosk owns the recipe catalog and resolves drinks to `{ ingredientId, ml }` dispense steps before calling the device. The ESP32 resolves each `ingredientId` to a pump using **machine-local configuration** stored in NVS. The kiosk edits that configuration; KV holds creative/menu content only.

Pour commands, calibration, bindings, and inventory updates happen on the device. The cloud is not in the real-time dispense path.

## Captured decisions

| Topic | Decision |
| ----- | -------- |
| Recipe storage | **Bundled JSON** in kiosk (v1); optional Cloudflare KV sync later — not firmware flash for full menu |
| Pump ↔ ingredient binding | **ESP32 NVS** — opaque `ingredient_id` string per pump; reflects what is plumbed right now |
| Ingredient semantics | **Kiosk only** — names, categories, manual vs pumped, recipe steps |
| Calibration (`ml_per_s`, anti-drip, etc.) | **ESP32 NVS** |
| Operational flags (`primed`, `last_cleaned_at`, …) | **ESP32** |
| Inventory (`remaining_ml`) | **ESP32 authoritative**; subtract on completed dispense; kiosk reads for display |
| Kiosk transport | **Wi-Fi HTTP** to ESP32 on LAN (BLE deferred) |
| Wi-Fi topology | **Station mode only** (v1) on home LAN; **no soft-AP** for normal operation yet |
| Wi-Fi provisioning | **Serial** (SSID/password) until captive-portal soft-AP is implemented |
| Device discovery | **mDNS** (e.g. `rumtime.local`); DHCP reservation as fallback |
| Offline operation | **Bundled recipes + PWA cache** (v1); optional KV sync or ESP32 favorites later |
| Manual pours | **Software only** — always available; no rear-panel test jumper |
| Software modes enum | **Not required for v1** — hardware cutoff is the real disable; avoid heavy FRC-style mode machinery early |
| Control pattern | Periodic **ControlTask** tick + thin **sequence runner** (FRC Timed Robot + command-scheduler pattern, not WPILib) |
| Pump safety (hardware) | **Rocker on pump 12 V VM** + driver **STBY** / safe GPIO defaults. **No software bus MOSFET for v1.** |
| Pump safety (software) | **Distributed** — each subsystem refuses unsafe work; no central safety pipeline. |
| Runtime model | PlatformIO + Arduino; explicit `ControlTask` + command queue; see below |
| Concurrency | **0 mutexes on motion path**; command queue + status snapshot at HTTP boundary |
| Bench rig today | Blocking serial handlers — migrate to non-blocking `ControlTask` architecture before product features |

## Data ownership

### Machine config (NVS)

Bindings and per-pump calibration survive reboot and do not depend on cloud availability.

Suggested fields per bound ingredient (see also [`06-flow-calibration-and-inventory.md`](06-flow-calibration-and-inventory.md)):

```text
ingredient_id          # opaque string, e.g. "bourbon" — max 23 chars on device
pump_id                # 1..16
ml_per_second          # per pump (hardware line), not per ingredient label
anti_drip_ms
primed
last_primed_at
last_cleaned_at
remaining_ml
bottle_size_ml
low_warning_ml
reserve_ml
```

The device validates bindings and dispense requests by ID lookup only. It never parses drink names or recipe documents.

Recipes never embed pump numbers. If `bourbon` is not bound or the bound pump is unavailable, the firmware rejects the request before starting motors.

### Recipes (cloud)

Recipe documents are step lists interpreted by firmware. Ingredient references are logical IDs only. Example shape (illustrative, not API contract):

```json
{
  "name": "Old Fashioned",
  "steps": [
    {
      "parallel": [
        { "dispense": { "ingredient": "bourbon", "ml": 60 } },
        { "dispense": { "ingredient": "simple", "ml": 10 } }
      ]
    },
    { "prompt": "Top with soda manually" }
  ]
}
```

Firmware validates bindings, session rules (for example session-only citrus), and safety preconditions before executing.

## Runtime model

ESP32 already runs FreeRTOS under Arduino. Product firmware **uses it explicitly** instead of fighting implicit multi-task behavior from Wi-Fi/HTTP.

```text
ControlTask (Core 1, priority ~10–12, default 5 ms period)
  vTaskDelayUntil fixed period:
    1. drain cancel messages (before other queue work)
    2. read machine inputs (cutoff sense GPIO if wired)
    3. pumpModuleBus.tick()       # stopAll() if cutoff open; sole motor output path
    4. scale.tick()               # non-blocking HX711 FSM only
    5. drain command queue (depth 1)
    6. coordinator.tick() + sequence runner
    7. publish status snapshot
    8. esp_task_wdt_reset()       # if subscribed

HTTP / async Wi-Fi task(s) (Core 0, priority ~3–5)
  parse JSON → xQueueSend(command) → return immediately
  read status snapshot (seqlock or double-buffer)
  never touch GPIO, I2C, pumps, or NVS

loop() (Core 1)
  empty or minimal; do not run motion logic here

Optional PersistTask (Core 1, low priority)
  NVS commit after job complete / idle — never during pour tick
```

| Rule | Detail |
| ---- | ------ |
| Framework | PlatformIO + Arduino (continue from bench-rig) |
| Motion owner | **ControlTask only** — scale, coordinator, pumps, I2C |
| Commands in | FreeRTOS queue, depth **1**, non-blocking send; **409 busy** if coordinator active |
| Status out | Snapshot struct; **single writer** (ControlTask); tear-free read for HTTP |
| Mutexes | **None** on scale / pumps / coordinator / sequences |
| I2C | Single-owner in ControlTask; optional bus mutex only if a second task touches I2C later |
| NVS | RAM authoritative during session; **no NVS writes in ControlTask during motion** |
| Migration to ESP-IDF | Deferred until operational pain (OTA, library blocking), not required for v1 |

**Why not `loop()`-only:** Kindle HTTP handlers run on a different task. Enqueue-only + snapshot avoids mutex soup and matches the coordinator’s one-job model.

**Default control period:** **5 ms** (1–10 ms acceptable). HX711 is rate-limited inside `scale.tick()`; faster ticks mainly help pour deadlines and safety polling, not ADC sample rate.

## Firmware internal architecture

### Design lineage

Patterns are informed by FRC **Timed Robot** (fixed-period tick) and **command-based** scheduling (composable non-blocking steps), ported lightly to ESP32 constraints:

- No WPILib on MCU.
- No blocking `delay()` in the control path after `setup()`.
- Sequences run **inside** `ControlTask` tick, not inside HTTP handlers or serial callbacks.

Bench rig today (`firmware/bench-rig/`) uses blocking `benchPollSerial()` during pours. Product firmware replaces that with state advanced each `ControlTask` period.

### Layered structure

```text
Layer 0 — Hardware abstraction (HAL)
    PumpChannel, PumpModule (I2C/PCA9685), ScalePlatform (HX711)
    MachineInputs (cutoff sense GPIO if wired — read once per tick)

Layer 1 — ControlTask periodic tick (~5 ms)
    machine inputs → pumpModuleBus.tick() → scale.tick()
    coordinator.tick() + sequence runner

Layer 2 — Activity coordinator
    At most one "job" at a time: recipe pour, cleaning sequence, manual pour, calibrate
    rejects new work when cutoff open; cancel processed before sequence advance

Layer 3 — Transport adapters (deferred API detail)
    HTTP / serial: enqueue commands only; read status snapshot
    Wi-Fi / TCP housekeeping on network task — not in ControlTask

Layer 4 — Persistence (optional PersistTask)
    NVS commit when idle or after job success — not during pour
```

**Safety is not a central pipeline.** Hardware rocker on pump VM is the real disable. Software safety lives in the components that already own the behavior: pumps refuse to run, scale aborts bad pours, coordinator refuses jobs. Optional cutoff sense GPIO keeps firmware state aligned with the rocker.

### Subsystems and exclusivity

Each pump is owned by at most one activity at a time. Parallel recipe steps acquire all needed pumps for the duration of that parallel group. Exclusivity is **coordinator policy**, not a mutex per pump.

| Component | Owns |
| --------- | ---- |
| `PumpChannel` / `PumpModuleBus` | Motor outputs (sole GPIO/I2C writers); `stopAll()`; refuses `run()` when cutoff open |
| `ScalePlatform` | HX711, tare, glass detect, flow-gate, flow timeout / no-flow abort |
| Activity coordinator | One job at a time; rejects enqueue when cutoff open; cancel clears job |
| Dispense / sequence steps | Pour preconditions (binding, glass policy, session ingredients) |
| `MachineInputs` | Debounced cutoff sense (if wired); read once per tick, not a policy engine |

### Dispense step behavior (v1)

Aligns with [`06-flow-calibration-and-inventory.md`](06-flow-calibration-and-inventory.md):

1. Preconditions: cutoff closed, no fault, binding exists, optional glass-present check.
2. Start implicated pump(s) forward.
3. **Flow-gated timer start** when glass on scale; timed-from-motor-on fallback if scale fault policy allows.
4. Run until per-pump ml timer expires (open-loop v1).
5. Anti-drip reverse per pump config.
6. Optional aggregate sanity check on mass delta.
7. Subtract inventory in RAM on successful completion; NVS commit deferred to idle/PersistTask.

Simultaneous multi-pump pour: parallel step with deadline = longest ingredient pour.

Sequence runner step types (illustrative): `dispense`, `parallel`, `wait_until`, `prompt`, `dwell`, `prime`, `drain` — each: init → tick → finished → cleanup.

### Manual pour

Always available in software (no hardware test switch).

- **Manual pour:** specified `ml` for an ingredient or pump; uses same dispense path as recipe steps (calibration, anti-drip, flow-gate policy as configured).
- **Raw run/stop** (bench-style): optional debug path; still respects hardware cutoff.

Manual and recipe dispense share `PumpChannel` and dispense state machine code.

### Cleaning sequences

Multi-step workflows (flush, sanitizer dwell, drain) are **sequence runner** jobs, not ad-hoc blocking scripts. Long dwells use non-blocking timers (`finished` when `millis() >= dwell_end`). See [`07-cleaning-and-food-safety.md`](07-cleaning-and-food-safety.md).

Cleaning steps do not subtract ingredient inventory unless intentionally dispensing ingredient fluid.

### Safety

```text
Hardware (v1):  fuse → rocker cutoff → pump VM → TB6612 (STBY + IN1/IN2/PWM)
                No software-controlled bus MOSFET for v1.

Boot:           STBY low, IN1/IN2 low before Wi-Fi or pours.

Distributed software checks (examples):
  PumpChannel:     no motor writes if cutoff open; stopAll() clears STBY/PWM
  Coordinator:     no new job if cutoff open; cancel drains in-flight work
  DispenseStep:      binding exists; scale flow-gate / timeout per docs/06
  ScalePlatform:     no-flow abort during gated pour

HTTP/serial:    enqueue only — never motor GPIO or I2C directly.
```

The rocker removes pump energy. STBY and `stopAll()` stop motion when the rocker is closed. Cutoff sense GPIO (optional, when wired) lets firmware report state and refuse work — it does not replace the rocker. The worst-case software cutoff-reaction latency is one control period (~5 ms): `MachineInputs::tick()` → `PumpBus::tick()` → `stopAll()`; the hardware rocker is instantaneous and is the real disable.

An external pull-down (e.g. 10 kΩ to GND) on the TB6612 STBY line is recommended: firmware cannot assert GPIO before `setup()` runs, so the pin floats during the early boot window and a pull-down ensures the driver stays disabled until `PumpBus::begin()` takes control.

A software bus switch in series with the rocker is **out of scope for v1** unless a later hardware revision wants it.

### Persistence

Use ESP32 **NVS** for machine config and inventory. **RAM is session-authoritative** during pours; commit to NVS when idle or after job success (PersistTask or end-of-job hook). Never block ControlTask on `nvs_commit` during motion.

Version the schema; migrate or reset on breaking changes.

Recipes are **not** stored in NVS for the full menu. Optional later: small favorites snapshot for offline pour nights.

### Suggested libraries (when implementing)

| Concern | Direction |
| ------- | --------- |
| JSON on ESP32 | ArduinoJson v7 |
| HTTP server | ESP-IDF `esp_http_server`, or async wrapper (for example PsychicHttp); handlers enqueue only |
| JSON schema / validation | Keep schemas small; validate required fields in firmware |
| Cloud / kiosk | Out of firmware scope; see deferred API doc |

### Implementation rules

Hard requirements for product firmware; skipping them reopens concurrency and safety bugs.

1. **HX711 non-blocking** — no `wait_ready_timeout` / multi-ms blocking in ControlTask (refactor bench `ScaleDriver` to FSM).
2. **HTTP handlers** — parse → queue → return; no NVS, I2C, or pump GPIO in handler context.
3. **Command queue** — depth 1; reject duplicate dispense with busy; cancel drained before sequence advance.
4. **Status snapshot** — seqlock or double-buffer; document ≤1 tick staleness for kiosk poll.
5. **ControlTask priority** above async HTTP; pin ControlTask to Core 1; measure tick overrun under 4× PCA9685.
6. **Watchdog** — feed from ControlTask (or register it with TWDT); empty `loop()` alone is insufficient.
7. **Single motor output path** — all pump GPIO/I2C through `PumpChannel` / `PumpModuleBus`; local refusal when cutoff open.
8. **Inventory / NVS** — subtract RAM on success only; never on cancel; flash write off hot path.

## Migration from bench rig

| Bench rig today | Product firmware target |
| --------------- | ------------------------ |
| Blocking `dispenseMl()` / `dispenseMlGated()` | Stateful dispense step in sequence runner |
| Serial command handlers run to completion | Serial enqueues to same command queue as HTTP |
| `busy_` flag | Activity coordinator + per-pump ownership |
| 2 pumps GPIO | Up to 16 pumps via I2C modules |
| `benchPollSerial` during waits | `ControlTask` tick advances dispense/flow-gate state |
| Blocking HX711 reads | Non-blocking `scale.tick()` FSM |

Preserve validated behavior: flow-gate timing, anti-drip duration, ml/s calibration model.

## Phased implementation

Implementation lives in [`firmware/controller/`](../firmware/controller/README.md) (product) and [`firmware/bench-rig/`](../firmware/bench-rig/) (Phase 0 bring-up reference). Status as of 2026-07-05:

1. ~~**ControlTask skeleton**~~ — done: 5 ms FreeRTOS task on Core 1, non-blocking scale FSM, pump bus, TWDT, tick order per this doc.
2. ~~**Command queue**~~ — done: depth-1 queue, cancel-first drain, busy on duplicate dispense; serial enqueue path bench-verified.
3. ~~**NVS config**~~ — done: `ConfigStore` with per-pump calibration + bindings; idle-commit hook; serial + HTTP config via `ConfigOpQueue`.
4. ~~**Sequence runner**~~ — done: sequential multi-ingredient pours (`pour` serial + `POST /pour`); parallel groups still deferred.
5. ~~**Wi-Fi HTTP**~~ — done: STA + mDNS + kiosk HTTP API + `InventoryStore` + cross-task config queue; Arduino `WebServer` + ArduinoJson v7 on Core 0.
6. **Cleaning sequences** — compose existing step types.
7. **I2C pump modules** — replace GPIO bench driver with `PumpModule` HAL.

## Assumptions baked into this doc

These were not explicitly decided in conversation; they were inferred for v1 and should be confirmed or changed.

| Assumption | Basis |
| ---------- | ----- |
| **5 ms** default `ControlTask` period | Reviewer recommendation; 1–10 ms still acceptable |
| ControlTask on **Core 1**, HTTP/Wi-Fi on **Core 0** | Common ESP32 Arduino layout; not bench-measured on this hardware yet |
| Priority **~10–12** for ControlTask, **~3–5** for HTTP | Typical starting point; needs profiling under real Wi-Fi load |
| Command queue **depth 1** + **409 busy** on duplicate dispense | Matches one-coordinator-job model; kiosk debounce not specified |
| **PersistTask** (or idle hook) for NVS — not inline in ControlTask | Reviewer consensus; **controller uses idle hook** in `ControlTask::tick()` (1 s retry backoff on commit failure); dedicated `PersistTask` still deferred |
| **PsychicHttp** or similar named as HTTP direction | Example only; library not chosen |
| Glass on scale for recipe pours | **Required** (flow-gate); **manual bypass** for timed-from-motor-on — see [`17-kiosk-ui-plan.md`](17-kiosk-ui-plan.md) |
| **Flow-gated** pour remains v1 default; timed fallback on scale fault | From existing docs 06/12; bench Tests 7–9 still gating |
| Cutoff sense via **GPIO** (DPDT aux or VM divider) | Optional for firmware coherence; rocker on VM is required |
| Cancel **aborts pour** immediately (may skip anti-drip) | **Locked** — acceptable UX; see doc 17 |
| Inventory subtract on **job success only** in RAM; NVS after | You confirmed ESP32 authoritative; commit timing was reviewer-added |
| Recipe JSON step schema (`parallel`, `prompt`, etc.) | Illustrative; not a locked contract |
| Session-ingredient blocking | Kiosk **confirm** on drink detail before pour; firmware validator TBD |
| `prompt` steps block new dispense until kiosk ACK | UI flow locked in doc 17 |
| WebSocket for status later uses same snapshot model | Mentioned as compatible; transport not decided |
| No dedicated safety FreeRTOS task for v1 | Hardware rocker + distributed checks sufficient |
| Arduino stays through v1; ESP-IDF migration deferred | Your alignment with bench-rig toolchain |

## Open questions

| Topic | Status |
| ----- | ------ |
| HTTP/API contract (`/dispense`, `/config`, status poll vs WebSocket) | **Implemented** — [`18-kiosk-device-api.md`](18-kiosk-device-api.md); poll-only v1 |
| Offline pour (kiosk cache vs ESP32 favorites) | Deferred by you |
| LAN auth (PIN, pairing) | Deferred; home-trusted LAN assumed |
| Cutoff sense wiring (aux pole vs VM divider) | Optional hardware; rocker on VM is required |
| Cancel during anti-drip: stop now vs complete reverse | **Locked:** stop now; skip anti-drip OK |
| Manual pour: require glass / flow-gate or bypass | **Locked:** bypass available — doc 17 |
| Glass-present required for all recipe pours? | **Locked:** yes, with manual bypass — doc 17 |
| Kiosk UX (menu, PIN, bottle bay, pour tuning, inventory block, pour anyway, session confirm) | **Locked** — [`17-kiosk-ui-plan.md`](17-kiosk-ui-plan.md) |
| Wi-Fi soft-AP provisioning | **Deferred** — serial provisioning for v1 |
| HTTP library choice | Implementation open |
| Core pinning and priorities | Implementation open until profiled |
| Whether `loop()` or ControlTask feeds TWDT | **ControlTask feeds TWDT** in controller firmware (including before/after idle NVS commit) |
| Display on ESP32 (local OLED vs kiosk-only status) | Mentioned optional in system context; not decided |

## Deferred

| Topic | Notes |
| ----- | ----- |
| HTTP/API contract | **Provisional kiosk draft:** [`18-kiosk-device-api.md`](18-kiosk-device-api.md) — firmware must reconcile |
| Offline recipe cache | Kiosk Service Worker vs ESP32 favorites |
| BLE transport | Only if Wi-Fi proves insufficient |
| Wi-Fi soft-AP / captive portal | After serial provisioning proves painful |
| Closed-loop mass stop per ingredient | After timed + flow-gate validated insufficient |
| Full command-framework (WPILib-style requirements) | Add only if pump conflicts appear in practice |
| Auth on LAN | Optional PIN if untrusted guests on Wi-Fi |

## Related documents

- [`01-decisions.md`](01-decisions.md) — captured software/firmware decisions summary
- [`02-system-architecture.md`](02-system-architecture.md) — hardware block diagrams
- [`06-flow-calibration-and-inventory.md`](06-flow-calibration-and-inventory.md) — pour timing and inventory fields
- [`07-cleaning-and-food-safety.md`](07-cleaning-and-food-safety.md) — cleaning workflows
- [`firmware/controller/`](../firmware/controller/) — product firmware (ControlTask, coordinator, NVS `ConfigStore`, serial transport)
- [`firmware/bench-rig/`](../firmware/bench-rig/) — Phase 0 bring-up (blocking model)
- [`17-kiosk-ui-plan.md`](17-kiosk-ui-plan.md) — locked kiosk UX and frontend stack
- [`18-kiosk-device-api.md`](18-kiosk-device-api.md) — provisional kiosk HTTP contract (draft)
