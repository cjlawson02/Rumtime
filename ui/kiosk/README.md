# Rumtime Kiosk UI

Production kiosk app for the Rumtime home cocktail machine. Static **React** PWA served over **LAN HTTP** on the kiosk device or a machine on the same network; pour commands go to the ESP32 over LAN HTTP (mocked in dev).

## Stack

| Layer        | Choice                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Framework    | **React 19**                                                                                                |
| Build        | Vite 8 + `@vitejs/plugin-react`                                                                             |
| Styling      | Tailwind CSS v4 + shadcn/ui (`base-nova` / Base UI)                                                         |
| Routing      | wouter (lazy route chunks)                                                                                  |
| Server state | TanStack Query — device `/status` polling + write mutations                                                 |
| Validation   | Zod (recipes + device types)                                                                                |
| Tests        | Vitest — availability, notifications, setup unlock, device errors, HTTP client, pump lifecycle, mock device |
| Mock device  | In-memory client + MSW (dev only)                                                                           |
| PWA          | `vite-plugin-pwa` — caches app shell + bundled recipes; **excludes** ESP32 URLs; updates prompt-only      |

## Project layout

```text
src/
  api/              DeviceClient, mock + HTTP client, MSW handlers, Zod types
  components/kiosk/ Bottle bay, pour tuning wizards, shell, availability UI
  components/ui/    shadcn primitives
  data/             recipes.json, setup-sections, categories, pumped-ingredients
  hooks/            use-device-status + use-device-mutations (TanStack Query), use-menu-category, use-setup-return
  lib/              availability preflight, notifications feed, calibration, config
  pages/            guest + setup routes
```

## Scripts

```bash
npm ci
npm run dev       # Vite dev server + MSW mock device
npm run build     # typecheck + production bundle
npm run lint
npm run format        # write
npm run format:check  # CI-style check
npm run test      # vitest
npm run preview   # serve dist/
```

Copy `.env.example` to `.env.local` for local overrides.

| Variable               | Default                | Purpose                                         |
| ---------------------- | ---------------------- | ----------------------------------------------- |
| `VITE_DEVICE_API_BASE` | `http://rumtime.local` | ESP32 base URL (MSW intercepts in dev)          |
| `VITE_SETUP_PIN`       | _(empty)_              | 4-digit setup PIN; empty = gate disabled in dev |
| `VITE_DEVICE_POLL_MS`  | `500`                  | Device status poll interval (ms)                |

## Deploy (LAN HTTP)

The kiosk is intended to run on the **same LAN** as the ESP32, served over **HTTP** (e.g. `npm run preview`, nginx, or a static file server on the kiosk tablet/mini-PC). Both the UI origin and `VITE_DEVICE_API_BASE` must be HTTP so the browser can reach the device API.

Cloudflare Pages (HTTPS) is **not** the production kiosk path — HTTPS origins cannot call `http://rumtime.local` (mixed content). Pages may still be used for preview builds if the device API is proxied over HTTPS; that is out of scope for v1.

Set `VITE_SETUP_PIN` at build time (exactly 4 digits) for production. Without it, setup and refill PIN flows are locked (fail closed). Dev allows an unset PIN.

## Security model

**No device API authentication in v1.** The setup PIN and session unlock are **operator UX gates only** — they deter casual guest access on a shared tablet, not determined attackers. Anyone on the LAN can call the ESP32 HTTP API directly. That is acceptable for a home bar on a trusted network; do not expose the device port to the internet.

Refill PIN success grants the same 15-minute setup unlock as the setup gate (full setup access).

## Guest flow

1. **Menu** — category pills (React state, not URL params); grid shows **only drinks with all lines bound, primed, and enough inventory**. **Notification center** (alert icon by setup) lists firmware alerts + hidden-drink reasons.
2. **Drink detail** — pumped vs manual lists; inline issue chips on pumped lines; **Pour anyway** when only inventory blocks
3. **Session confirm** — AlertDialog on **Make it** / **Pour anyway** when manual ingredients exist (not before)
4. **Pour active** — progress; errors surfaced in UI
5. **Prompt step** — full-screen manual instruction (e.g. soda top-off) → Done
6. **Done** — success + spinner → auto-return to menu after **3 s**

## Setup flow (PIN-gated)

Setup copy lives in [`src/data/setup-sections.ts`](src/data/setup-sections.ts). Navigation uses a **single back button**; return path and menu category filter are **React context** (not query params).

| Route                | Screen                                                                                   | Status |
| -------------------- | ---------------------------------------------------------------------------------------- | ------ |
| `/setup`             | Setup index                                                                              | Live   |
| `/setup/pumps`       | **Bottle bay** — line binding, bottle size (presets + custom), fill level, mark refilled | Live   |
| `/setup/calibration` | **Pour tuning** — flow rate, anti-drip, prime/calibrate wizards                          | Live   |
| `/setup/cleaning`    | **Line cleaning**                                                                        | Live   |
| `/setup/device`      | **Machine status**                                                                       | Stub   |

**Bottle bay:** two-column line cards; ingredient + bottle size on one row; fill level with green-check / red-X save/cancel; **Mark refilled** on the fill row when not editing. Preset bottle sizes: 375 ml, 750 ml, 1 L, 1.75 L.

**Pour tuning:** per-line prime and calibrate wizards — see [`docs/17-kiosk-ui-plan.md`](../../docs/17-kiosk-ui-plan.md).

**PIN:** client-side UX gate only (`src/lib/config.ts`).

## Device API boundary

`DeviceClient` in `src/api/device-client.ts` — full contract in [`docs/18-kiosk-device-api.md`](../../docs/18-kiosk-device-api.md).

| Endpoint                      | Purpose                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `GET /status`                 | Bindings, pump slots, pour job, pump dispense job, optional **`notifications[]`** |
| `POST /pour`                  | Start recipe pour                                                                 |
| `POST /pour/cancel`           | Stop immediately                                                                  |
| `POST /pour/ack`              | Acknowledge manual prompt step                                                    |
| `POST /pumps/binding`         | Assign ingredient to line                                                         |
| `POST /inventory/bottle-size` | Set bottle size (ml)                                                              |
| `POST /inventory/level`       | Set manual fill level (ml)                                                        |
| `POST /inventory/refill`      | Mark bottle full after swap                                                       |
| `POST /inventory/primed`      | Set primed flag                                                                   |
| `POST /pumps/calibration`     | Flow rate + anti-drip                                                             |
| `POST /pumps/dispense`        | Prime / calibration / verify run                                                  |
| `POST /pumps/dispense/cancel` | Stop continuous prime                                                             |

Dev uses `HttpDeviceClient` with MSW intercepting `rumtime.local`. Production uses the same client against real ESP32 HTTP when available.

Firmware **should include** `pumps[]` (physical line assignments) and explicit `primed: true | false` on every binding in `/status`. The UI treats missing `primed` as not pour-ready and falls back to `bindings` when `pumps` is empty or omitted.

## TypeScript

Strict `tsc` on all of `src/`. `npm run test` in CI.

## Contributing

- **Routes:** add lazy imports and `<Route>` entries in `src/app.tsx`.
- **Device API:** update Zod types in `src/api/types.ts` and MSW handlers in `src/api/msw/handlers.ts`, then reconcile `docs/18-kiosk-device-api.md`.
- **Mock vs hardware:** dev uses `HttpDeviceClient` with MSW; production uses the same client against the ESP32 base URL from `VITE_DEVICE_API_BASE`.
- **Status polling:** use `useDeviceStatus()` from any screen — one shared React Query poll (`VITE_DEVICE_POLL_MS`, default 500ms). Call `refresh()` for manual retry (offline banner).
- **Device writes:** use hooks from `src/hooks/use-device-mutations.ts` (`useStartPour`, `useUpdatePumpBinding`, etc.). They call `DeviceClient` and invalidate `['device', 'status']` on success — do not import `deviceClient` in pages or wizards.

## Related docs

- [`docs/17-kiosk-ui-plan.md`](../../docs/17-kiosk-ui-plan.md) — locked UX
- [`docs/16-firmware-and-software-architecture.md`](../../docs/16-firmware-and-software-architecture.md) — data ownership
- [`docs/18-kiosk-device-api.md`](../../docs/18-kiosk-device-api.md) — HTTP contract vs firmware
