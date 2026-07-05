# Kiosk UI Plan

Status: **UX locked** · **production scaffold** (2026-07-04).

Production app at [`ui/kiosk/`](../ui/kiosk/) — see [`ui/kiosk/README.md`](../ui/kiosk/README.md). POC torn down; mock device + bundled recipes in place until ESP32 HTTP lands.

## System context

```text
Cloudflare Pages (static kiosk PWA)
    recipes/menu bundled or synced (see 01-decisions)

Kindle Fire (Fully Kiosk or equivalent, home Wi-Fi)
    HTTP JSON → ESP32 on LAN (pour, config, status)
    mDNS discovery (e.g. rumtime.local)

ESP32-S3 (station mode on home LAN)
    NVS: bindings, calibration, inventory
    Serial: bench debug + Wi-Fi credential provisioning until soft-AP exists
```

Pour commands never route through Cloudflare. Internet is optional at runtime if recipes are cached in the PWA.

## Connectivity (locked)

| Topic | Decision |
| ----- | -------- |
| Kiosk ↔ ESP32 transport | **Wi-Fi HTTP** (JSON). BLE and USB-serial are **not** kiosk paths. |
| Wi-Fi topology (v1) | **Station mode only** on home LAN. No ESP32 soft-AP for normal operation yet. |
| Wi-Fi provisioning (v1) | Enter SSID/password over **USB serial** until captive-portal soft-AP is implemented. |
| Device discovery | **mDNS** hostname (e.g. `rumtime.local`); DHCP reservation as fallback. |
| Soft-AP provisioning | **Deferred** — add when serial provisioning becomes painful. |

## User modes

| Mode | Access | Purpose |
| ---- | ------ | ------- |
| **Guest** | Default | Browse menu, pour drinks |
| **Setup** | **4-digit PIN** | Bottle bay, pour tuning, line cleaning, machine status |

## Locked UX decisions

| Topic | Decision |
| ----- | -------- |
| Glass on scale | **Required** for recipe pours (flow-gate path). **Manual bypass** available (timed-from-motor-on; same class as bench `dispense open`). |
| Setup PIN | **4-digit PIN** to enter setup screens. **Client-side UX gate only** — not a security boundary; device must enforce setup actions. |
| Unavailable drinks | **Hidden** from the menu grid. Only drinks with all pumped lines bound and sufficient inventory (`remaining_ml ≥ pour_ml + 10 ml`) appear. Blocked drinks and reasons surface in the **notification center** (see below). |
| Notification center | **Alert icon** next to setup (badge = open item count). Merges **firmware `notifications`** from `/status` with **kiosk-computed menu alerts** (unbound line, low inventory → which drinks hidden). Per-item severity (`info` / `warning` / `error`), optional `actionHref`. |
| Inventory block | **Hard stop** on drink detail when `remaining_ml < pour_ml + 10 ml`. UI offers **Pour anyway** (inventory bypass) when only low stock blocks; firmware must still enforce. |
| Menu layout | **Grid** of drink tiles with **category pills** across the top (base spirit type: whiskey, vodka, gin, etc.). |
| Session ingredients | On drink detail, show **"You add manually"** for session-only / manual items (citrus, carbonated top-off, garnish). **Do not** affect menu availability or pre-confirm state. User confirms in a modal **only when tapping Make it** (pour request). |
| Cancel during anti-drip | **Stop immediately** — skipping anti-drip on cancel is acceptable; not a UX concern. |
| ESP32 discovery | **mDNS** primary; fixed IP via DHCP reservation if mDNS fails. |

## Guest flow (summary)

1. **Menu** — category pill filters grid (filter state in React context, not URL); **only ready drinks** shown. Notification icon when anything is blocked or firmware reports alerts.
2. **Drink detail** — pumped vs session/manual lists; inventory warnings on pumped lines; **Make it** always labeled the same (no pre-confirm state).
3. **Confirm session items** — modal on **Make it** (or **Pour anyway**) when manual ingredients exist → user confirms once, then pour starts.
4. **Pre-pour** — glass on scale (or explicit bypass in service/setup context).
5. **Pour active** — step progress, **Cancel** always visible.
6. **Prompt steps** — full-screen instruction (e.g. top with soda) → **Done** ACK.
7. **Done** — brief success + spinner → **auto-return to menu after 3 s** (no manual "Menu now" control).

## Availability rules (kiosk-side)

### Menu (what appears in the grid)

```text
show drink if:
  every pumped ingredient is bound to a line
  remaining_ml ≥ step_ml + 10 for every pumped ingredient

manual / session ingredients do NOT affect menu visibility
```

Hidden drinks are grouped into notification-center alerts (which ingredient, which drinks affected).

### Drink detail (Make it)

```text
blocked if:
  any pumped ingredient unbound
  remaining_ml < step_ml + 10 for any pumped ingredient

manual ingredients: confirm in modal at pour request only (not tracked before)
```

**Pour anyway** bypasses low-inventory block only (not unbound). Firmware remains authoritative on reject; kiosk preflight avoids obvious failures.

### Notification center feed

Implemented in [`ui/kiosk/src/lib/notifications.ts`](../ui/kiosk/src/lib/notifications.ts) + [`notification-center.tsx`](../ui/kiosk/src/components/kiosk/notification-center.tsx).

| Source | Origin | Examples |
| ------ | ------ | -------- |
| **device** | `DeviceStatus.notifications[]` from firmware | Scale not ready, config persist error, flow timeout |
| **menu** | Kiosk computes from recipe catalog + bindings/inventory | Line not connected, bottle low → hides N drinks |

Sorted by severity (error → warning → info). Device alerts precede menu alerts at the same severity.

## Setup screens (PIN-gated)

Copy and icons: [`ui/kiosk/src/data/setup-sections.ts`](../ui/kiosk/src/data/setup-sections.ts). **Navigation:** single **back** control — setup index back exits to guest flow; section pages back to index. **Return path** stored in `SetupReturnProvider` when entering setup from menu or drink detail (not URL query params).

| Screen | Route | Purpose |
| ------ | ----- | ------- |
| **Bottle bay** | `/setup/pumps` | Ingredient per line, bottle size, manual fill, **Mark refilled** |
| **Pour tuning** | `/setup/calibration` | Per-line flow rate, anti-drip, **Prime** / **Calibrate** wizards |
| **Line cleaning** | `/setup/cleaning` | Per-line flush / sanitize / drain wizards |
| **Machine status** | `/setup/device` | Stub — copy only |

### Bottle bay UX (implemented)

- Two-column grid of line cards (`Line 1`, …).
- **Ingredient** dropdown and **bottle size** on one row (presets: 375 ml, 750 ml, 1 L, 1.75 L; **Custom…** with ml input + save/cancel).
- **Fill level** (ml) with green-check / red-X save/cancel when editing.
- **Mark refilled** on the fill row (when not editing); green check after refill until fill or bottle size changes.
- Bottle level bar and ingredient summary below.

### Pour tuning UX (implemented)

- Per-line card: **`Line N` + primed badge** inline (`Primed` / `Needs prime`), ingredient name, **Prime** / **Calibrate** top-right.
- Inline **flow rate** and **anti-drip** fields (save on confirm); flow rate label shows derived **`{N}s / shot`** (1.5 US fl oz, rounded) — operator-facing pour time, not ml/s summary text.
- **Prime wizard** (3 steps): prepare → continuous run (footer: emergency stop · **Nozzle is wet**) → done. Spare glass, not drip tray. 60 s safety cutoff.
- **Calibrate wizard** (6 steps): **run calibration pour** (primed badge + **Prime this line** + **Run 25s pour** on one step) → measure → save rate → optional verify grid (15/30/60 ml) → anti-drip tune (test pour + anti-drip field only) → done.
- Wizard actions live in the **footer** (`SetupWizardShell`); dispense status is read-only in the body.
- Setup dispenses (`calibration`, `verify`) **deduct inventory** by volume poured; menu availability uses a separate **10 ml buffer** per pumped line (tubing dead volume), not a pour skip.
- **Primed** required for all setup dispenses except continuous **prime** runs; firmware should reject unprimed pours (`422`).

### Primed state (partial)

- Kiosk shows primed on each line and **blocks setup pours** (calibrate + verify) until primed (prime wizard or manual mark via prime flow).
- **`primed=false` does not hide drinks from the menu** today; policy for guest pour block or notification-only warning is still TBD.

## Still deferred

| Topic | Notes |
| ----- | ----- |
| HTTP/API contract | Endpoint shapes — **provisional kiosk draft:** [`18-kiosk-device-api.md`](18-kiosk-device-api.md); firmware HTTP not shipped |
| Recipe source at runtime | Bundled JSON + PWA cache vs KV sync — see software stack in [`01-decisions.md`](01-decisions.md) |
| Visual design / typography | After wireframes |
| Mixed content (HTTPS Pages → HTTP ESP32) | Validate on target Fire + Fully Kiosk |
| Glass-present heuristic thresholds | Firmware; kiosk shows raw status + messaging — **UI not wired yet** |
| Primed on guest menu | Warning vs block vs notification-only — badge + calibrate gate done; pour policy TBD |
| Firmware → kiosk alerts | `DeviceStatus.notifications[]` in doc 18; kiosk UI wired; firmware HTTP not shipped |
| Pour error surfacing | Kiosk shows alert on `beginPour` failure; richer error taxonomy TBD |
| Cleaning / device setup pages | Stubs only — align cleaning with [`07-cleaning-and-food-safety.md`](07-cleaning-and-food-safety.md) |

## Frontend stack (locked 2026-07-04, React pivot 2026-07-04)

Production app in [`ui/kiosk/`](../ui/kiosk/). **React 18** chosen over Preact for full strict `tsc` with shadcn/Base UI (Preact ref typing was incompatible without shims).

| Layer | Decision |
| ----- | -------- |
| Framework | **React 18** |
| Build | **Vite 8** + `@vitejs/plugin-react` |
| Styling | **Tailwind CSS v4** + `@tailwindcss/vite` |
| Components | **shadcn/ui v4** (`base-nova`) — **@base-ui/react** primitives |
| Routing | **wouter** |
| Icons | **lucide-react** |
| Deploy | **Cloudflare Pages** static SPA |
| Bundle (menu `/`) | ~83 KB JS gzip + ~8 KB CSS (React runtime ~50 KB of that) |

TypeScript: strict `tsc` on all of `src/`. See [`ui/kiosk/README.md`](../ui/kiosk/README.md).

**Fire tablet:** Tailwind v4 OKLCH + mixed content to ESP32 still unverified on hardware.

## Related documents

- [`01-decisions.md`](01-decisions.md) — software stack summary
- [`ui/kiosk/README.md`](../ui/kiosk/README.md) — production kiosk app
- [`16-firmware-and-software-architecture.md`](16-firmware-and-software-architecture.md) — firmware runtime, data ownership
- [`06-flow-calibration-and-inventory.md`](06-flow-calibration-and-inventory.md) — inventory fields and pour rules
- [`07-cleaning-and-food-safety.md`](07-cleaning-and-food-safety.md) — cleaning workflow
