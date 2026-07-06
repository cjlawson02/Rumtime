# Kiosk ↔ Device HTTP API (draft)

Status: **IMPLEMENTED on firmware** (2026-07-05). Kiosk Zod schemas in [`ui/kiosk/src/api/types.ts`](../ui/kiosk/src/api/types.ts) are the acceptance target for `GET /status`. Serial bench transport remains for debug and Wi-Fi provisioning.

## Why this exists

The production kiosk at [`ui/kiosk/`](../ui/kiosk/) uses `DeviceClient` + Zod types in [`src/api/types.ts`](../ui/kiosk/src/api/types.ts). MSW mocks the endpoints below in dev. Firmware `GET /status` targets the same Zod schema (acceptance tests via golden JSON still deferred).

## Kiosk contract

Base URL: `http://rumtime.local` (mDNS) or `VITE_DEVICE_API_BASE`. **Deploy the kiosk UI over LAN HTTP** on the same network as the ESP32 — not HTTPS-to-HTTP mixed content.

**No API authentication in v1.** The kiosk setup PIN is an operator UX gate only; the device HTTP port is trusted-LAN. Do not expose it to the internet.

| Method | Path | Body | Response |
| ------ | ---- | ---- | -------- |
| GET | `/status` | — | `DeviceStatus` JSON |
| POST | `/pour` | `{ "recipeId": string, "steps": [{ "ingredientId", "ml" }] }` | `204` or error |
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

`pumpJob` on `/status` **only while a dispense is active**. When idle (no pour in progress), `pumpJob` is **`null`** — that is the primary idle signal for setup wizards (prime/calibration/verify). The kiosk treats **`pumpJob` cleared to `null`** as finished after a timed pour; explicit terminal `complete`/`cancelled` on `pumpJob` is optional polish.

**Recipe `job` (guest pours):** When a multi-step pour completes without a manual prompt step, firmware publishes a **brief terminal latch** (`job.state`: `"complete"` or `"cancelled"`, ~500 ms / at least one poll) before clearing `job` to `null`. The kiosk pour page keys off `job.state === "complete"` for drinks like Daiquiri (pumped-only + pre-pour lime). Prompt-step drinks remain a known gap until the prompt FSM exists.

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

**`primed` in NVS** is stored via `InventoryStore` and set by kiosk `POST /inventory/primed` (or serial bind + primed HTTP after bind).

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

`job.state`: `idle` | `pouring` | `prompt` | `complete` | `cancelled`. Prefer `job: null` when idle; the kiosk normalizes `idle` to null. For pumped-only recipes, firmware **must** emit `complete` (or `cancelled`) for at least one poll before returning to `job: null`.

**Firmware should always include:**

- **`pumps[]`** — physical line → ingredient assignments (may be empty during boot; kiosk falls back to `bindings` when empty or omitted).
- **`primed: true | false`** on every entry in `bindings` — omit or `undefined` is treated as **not primed** (guest pours blocked).

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

Kiosk-computed menu alerts (hidden drinks, low inventory) are **not** echoed in this array — the kiosk derives them from recipes + `bindings` / `pumps`.

**Dev mock:** [`ui/kiosk/src/api/mock-device.ts`](../ui/kiosk/src/api/mock-device.ts) seeds `scale_not_ready` and `flow_timeout` (`flow_timed_out` snapshot) so the notification center can be exercised without real firmware.

### Ingredient IDs (locked)

`ingredientId` is an **opaque string** on the ESP32. The device stores `pump ↔ ingredientId` in NVS and resolves dispense steps by ID. It does **not** store or interpret names, categories, or recipe structure.

| Owner | Responsibility |
| ----- | -------------- |
| **Kiosk** | Recipe catalog, display names, categories, menu availability, resolving a drink to `{ ingredientId, ml }` steps, manual-step UX |
| **ESP32** | Persist bindings, calibration (per pump), inventory/ops state keyed by `ingredientId`, execute dispense steps |

Constraints on device: non-empty, max **23 characters** (`kIngredientIdMax` in firmware), unique across pumps, no spaces on serial `bind` (single token).

The bottle-bay dropdown today lists IDs from bundled `recipes.json`; that is a UX convenience, not a firmware requirement — any valid string may be bound.

### Pour command

Kiosk resolves the recipe locally, then sends pumped steps only:

```json
{
  "recipeId": "old-fashioned",
  "steps": [
    { "ingredientId": "bourbon", "ml": 45 },
    { "ingredientId": "simple", "ml": 10 }
  ]
}
```

`recipeId` is for **kiosk UI correlation** (`job.recipeId` in status). Firmware executes `steps` only — it does not load recipe documents. Manual ingredients never appear in `steps`; prompt UX stays on the kiosk after pumped lines finish.

Pour commands reference **ingredient IDs** from the kiosk catalog. Firmware resolves each ID → pump via NVS bindings ([`16-firmware-and-software-architecture.md`](16-firmware-and-software-architecture.md)).

## Firmware implementation (phase 5)

HTTP routes match the table above. `GET /status` is built by `device_status.cpp` to pass kiosk `deviceStatusSchema`. Handlers enqueue on `CommandQueue` / `ConfigOpQueue` only (Core 0); motion stays on ControlTask (Core 1).

**Implemented:** bindings, inventory (`remainingMl`, `bottleSizeMl`, `primed`), recipe pour, pump dispense (prime/verify/calibration), config edits with busy reject, mDNS, serial Wi-Fi provisioning.

**Deferred:** `prompt` steps / meaningful `POST /pour/ack`, cleaning (`flush`/`sanitize`/`drain` → 501), LAN auth, WebSocket status.

Serial transport remains for bench debug (`dispense`, `pour`, `prime`, `wifi *`, etc.).

Kiosk surfaces pour and setup errors in UI (alerts on drink detail, setup panels); firmware remains authoritative on reject.

## Hardware / WebView notes

Track on Kindle Fire + Fully Kiosk smoke test:

- **Mixed content** — HTTPS Pages → HTTP ESP32
- **Tailwind v4 OKLCH** — older WebView CSS support
- **`structuredClone`** — mock uses JSON clone fallback; avoid in hot paths on device

## Related documents

- [`16-firmware-and-software-architecture.md`](16-firmware-and-software-architecture.md) — runtime model, phased HTTP plan
- [`17-kiosk-ui-plan.md`](17-kiosk-ui-plan.md) — locked UX; bottle bay + pour tuning setup implemented
- [`ui/kiosk/src/api/types.ts`](../ui/kiosk/src/api/types.ts) — Zod schemas (firmware targets this shape)
