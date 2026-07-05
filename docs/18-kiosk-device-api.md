# Kiosk ↔ Device HTTP API (draft)

Status: **PROVISIONAL** (2026-07-04). The kiosk scaffold defines a UI-first contract for mock/dev. **Firmware has not implemented HTTP**; the live transport is still serial (`dispense`, `status`, `config`). This doc records the gap so neither side silently diverges.

## Why this exists

The production kiosk at [`ui/kiosk/`](../ui/kiosk/) uses `DeviceClient` + Zod types in [`src/api/types.ts`](../ui/kiosk/src/api/types.ts). MSW mocks the endpoints below in dev. When firmware phase 5 (Wi-Fi HTTP) lands, **one side must adapt** — either firmware exposes this shape, or the kiosk adds an adapter over the real snapshot/config API.

## Kiosk contract today (provisional)

Base URL: `http://rumtime.local` (mDNS) or `VITE_DEVICE_API_BASE`.

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| GET | `/status` | — | `DeviceStatus` JSON |
| POST | `/pour` | `{ "recipeId": string }` | `204` or error |
| POST | `/pour/cancel` | — | `204` |
| POST | `/pour/ack` | — | `204` (manual prompt step ACK) |
| POST | `/inventory/refill` | `{ "ingredientId": string }` | `204` (mark bottle refilled) |
| POST | `/inventory/bottle-size` | `{ "ingredientId": string, "bottleSizeMl": number }` | `204` |
| POST | `/inventory/level` | `{ "ingredientId": string, "remainingMl": number }` | `204` (manual fill level) |
| POST | `/pumps/binding` | `{ "pumpId": number, "ingredientId": string \| null }` | `204` |
| POST | `/pumps/calibration` | `{ "pumpId", "mlPerSecond", "antiDripMs" }` | `204` |
| POST | `/pumps/dispense` | `{ "pumpId", "purpose", "ml"? \| "durationSeconds"? }` | `204` |
| POST | `/pumps/dispense/cancel` | — | `204` |
| POST | `/inventory/primed` | `{ "ingredientId", "primed": boolean }` | `204` |

### Pump dispense and prime (kiosk contract)

`purpose`: `prime` | `calibration` | `verify`.

| Purpose | Body | Behavior |
| ------- | ---- | -------- |
| **prime** | `{ "pumpId", "purpose": "prime" }` only | **Continuous forward** until `POST /pumps/dispense/cancel` (kiosk: operator taps **Nozzle is wet**). No anti-drip on operator stop. **60 s safety cutoff** (`MAX_PRIME_SECONDS` in kiosk). Primed flag set by kiosk via `/inventory/primed`, not by dispense alone. |
| **calibration** | `{ "pumpId", "purpose": "calibration", "durationSeconds": 25 }` | Timed forward run (measuring cup / spare glass). |
| **verify** | `{ "pumpId", "purpose": "verify", "ml": 15 \| 30 \| 60 }` | Timed ml dispense using stored `ml_per_s`. |

**Operator UX:** Prime into a **spare glass** on the platform (or under the nozzle), not the guest pour glass. Watch the nozzle; stop when wet.

**Kiosk wizards:** Per-line **Prime** and **Calibrate** on `/setup/calibration` only (no global wizard entry). Footer holds step actions; body shows `PumpDispenseStatus` during runs. Calibration timed run uses `DEFAULT_CALIBRATION_RUN_SECONDS` (25) from [`ui/kiosk/src/lib/calibration.ts`](../ui/kiosk/src/lib/calibration.ts). Flow rate fields show **`{N}s / shot`** derived from `SHOT_ML` (1.5 US fl oz).

`pumpJob` on `/status` **only while a dispense is active**. When idle (no pour in progress), `pumpJob` is **`null`**. Terminal states (`complete`, `cancelled`) may appear briefly on some firmware builds, but the kiosk client treats **`pumpJob` cleared to `null`** as the idle signal after a timed pour finishes or is cancelled. Use a pour lifecycle tracker (`ui/kiosk/src/lib/pump-pour-lifecycle.ts`) to detect `running → finished/cancelled` across polls.

Example while running:

```json
{
  "pumpId": 1,
  "purpose": "prime",
  "state": "running",
  "progress": 0,
  "stepLabel": "Priming line…",
  "continuous": true,
  "elapsedSeconds": 12
}
```

Timed jobs set `progress` 0–100; continuous prime omits meaningful progress (elapsed seconds only).

### Serial equivalent (controller firmware)

Controller firmware implements continuous prime over serial (2026-07-04):

```text
prime <pump>          start continuous forward (no scale, no anti-drip on stop)
prime stop            operator stop — job ok, pump off, no reverse purge
stop | cancel         abort — job cancelled (mid-prime emergency only in kiosk)
```

Maps to kiosk `POST /pumps/dispense` + `cancel` when HTTP phase 5 lands. **`primed` in NVS** is still kiosk-side via `/inventory/primed` until firmware stores it.

### `DeviceStatus` (kiosk Zod schema)

```json
{
  "connected": true,
  "firmwareVersion": "0.1.0",
  "hostname": "rumtime.local",
  "bindings": {
    "bourbon": { "ingredientId": "bourbon", "remainingMl": 420, "bottleSizeMl": 750, "primed": true }
  },
  "pumps": [
    { "pumpId": 1, "ingredientId": "bourbon", "mlPerSecond": 1.75, "antiDripMs": 100 }
  ],
  "pumpJob": {
    "pumpId": 1,
    "purpose": "prime",
    "state": "running",
    "progress": 0,
    "stepLabel": "Priming line…",
    "continuous": true,
    "elapsedSeconds": 8
  },
  "job": {
    "recipeId": "old-fashioned",
    "state": "pouring",
    "progress": 42,
    "stepLabel": "Pouring bourbon…",
    "promptMessage": "Top with Sprite or 7-Up manually…"
  },
  "notifications": [
    {
      "id": "scale_not_ready",
      "severity": "warning",
      "title": "Scale not ready",
      "message": "Place an empty glass on the platform.",
      "actionHref": "/setup/device",
      "actionLabel": "Machine status"
    }
  ]
}
```

`job.state`: `idle` | `pouring` | `prompt` | `complete` | `cancelled`.

### `DeviceStatus.notifications` (optional)

Firmware-originated alerts shown in the kiosk **notification center** alongside kiosk-computed menu alerts. Kiosk does not synthesize these — it passes them through from `/status`.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | string | Stable key for dedup (e.g. `scale_not_ready`, `config_persist_error`) |
| `severity` | `info` \| `warning` \| `error` | Drives icon and sort order |
| `title` | string | Primary line in notification list |
| `message` | string (optional) | Secondary detail |
| `actionHref` | string (optional) | In-app route (e.g. `/setup/pumps`) |
| `actionLabel` | string (optional) | Button label when `actionHref` set |

Example firmware mappings (when HTTP ships):

| Snapshot / condition | Suggested `id` | Severity |
| -------------------- | -------------- | -------- |
| `scale_ready == false` during guest pour window | `scale_not_ready` | `warning` |
| `config_persist_error` | `config_persist_error` | `error` |
| `flow_timed_out` on last job | `flow_timeout` | `warning` |
| Cutoff open / unsafe | `cutoff_open` | `error` |

Kiosk-computed menu alerts (hidden drinks, low inventory) are **not** echoed in this array — the kiosk derives them from recipes + `bindings` / `pumps`.

**Dev mock:** [`ui/kiosk/src/api/mock-device.ts`](../ui/kiosk/src/api/mock-device.ts) seeds `scale_not_ready` and `flow_timeout` (`flow_timed_out` snapshot) so the notification center can be exercised without real firmware.

Pour commands reference **recipe IDs** from bundled kiosk JSON. Firmware resolves ingredients → pumps via NVS bindings ([`16-firmware-and-software-architecture.md`](16-firmware-and-software-architecture.md)).

## Firmware reality today

### Serial transport (bench / controller)

Commands enqueue to `CommandQueue`; status comes from `StatusSnapshot` ([`status_snapshot.h`](../firmware/controller/include/status_snapshot.h)):

```text
cutoff_open, pumps_running, scale_ready, grams, flow_detected, flow_timed_out
job_busy, job_ok, job_error, job_cancelled, job_phase, job_reject
config_dirty, config_persist_error
```

No HTTP routes. No per-ingredient inventory in the snapshot yet (NVS `ConfigStore` has bindings + calibration; inventory fields deferred per doc 16).

### Alignment gaps

| Kiosk expects | Firmware has (today) | Notes |
| ------------- | -------------------- | ----- |
| `bindings` + `remainingMl` per ingredient | NVS bindings; no inventory in snapshot | Kiosk preflight uses mock data only |
| `job.progress` 0–100 | `job_phase`, no percent | UI progress bar is mock-only |
| `job.promptMessage` | No prompt step in firmware | Doc 17 UX; sequence runner TBD |
| `POST /pour { recipeId }` | Serial `dispense` by pump/ml | Recipe runner not wired to HTTP |
| `POST /pumps/dispense` prime | Serial **`prime` / `prime stop`** on controller | HTTP handler TBD; kiosk + MSW mock today |
| Glass / scale preconditions | `scale_ready`, `grams`, flow-gate | Expose via `notifications[]` when HTTP ships |
| Primed state | Kiosk mock + `/inventory/primed`; NVS field planned on device | Badge + calibrate gate in UI |
| Guest notifications | Kiosk notification center | Merges `notifications[]` + menu availability alerts |

## Reconciliation options (pick before HTTP ships)

1. **Firmware extends API** — HTTP handlers aggregate `StatusSnapshot` + NVS bindings/inventory + coordinator into `DeviceStatus`. Kiosk types stay stable; mock retired.
2. **Kiosk adapter** — HTTP returns raw snapshot + config endpoints; kiosk maps to view models. More firmware flexibility, more kiosk code.
3. **Hybrid** — `/status` returns firmware-native JSON; kiosk keeps a thin `mapStatusSnapshot()` layer. Recommended if snapshot stays lean.

**Do not** implement HTTP handlers that touch GPIO/pumps directly — enqueue only per doc 16.

## Error codes (provisional)

| HTTP | Meaning |
| ---- | ------- |
| 409 | Device busy (`job_busy`) |
| 503 | Cutoff open / unsafe |
| 422 | Validation (unbound ingredient, unprimed line, low inventory, glass missing) |

Kiosk surfaces pour and setup errors in UI (alerts on drink detail, setup panels); firmware remains authoritative on reject.

## Hardware / WebView notes

Track on Kindle Fire + Fully Kiosk smoke test:

- **Mixed content** — HTTPS Pages → HTTP ESP32
- **Tailwind v4 OKLCH** — older WebView CSS support
- **`structuredClone`** — mock uses JSON clone fallback; avoid in hot paths on device

## Related documents

- [`16-firmware-and-software-architecture.md`](16-firmware-and-software-architecture.md) — runtime model, phased HTTP plan
- [`17-kiosk-ui-plan.md`](17-kiosk-ui-plan.md) — locked UX; bottle bay + pour tuning setup implemented
- [`ui/kiosk/src/api/types.ts`](../ui/kiosk/src/api/types.ts) — Zod schemas (provisional)
