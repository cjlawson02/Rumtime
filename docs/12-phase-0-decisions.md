# Phase 0 Decisions

Research-backed decisions for the Phase 0–1 bench rig. These lock choices enough to place a small order without committing to the full 8-pump BOM.

Sources: [Kamoer KPHM100 manual (PDF)](https://m.media-amazon.com/images/I/91ZPHUG4FOL.pdf), [Adafruit 1150](https://www.adafruit.com/product/1150), [Pololu TB6612FNG #713](https://www.pololu.com/product/713), [Toshiba TB6612FNG datasheet](https://toshiba.semicon-storage.com/us/semiconductor/product/motor-driver-ics/brushed-dc-motor-driver-ics/detail.TB6612FNG.html), [Mean Well GST60A12-P1J](https://www.bravoelectro.com/gst60a12-p1j.html), [Mean Well GST120A12-R7B](https://www.trcelectronics.com/products/mean-well-gst120a12-r7b).

## Pump selection

### Primary: Kamoer KPHM100-HB-B10

| Spec            | Value                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Model code      | **KPHM100-HB-B10** — 12 V DC **brushed** (HB), B10 tubing                                             |
| Aliases         | Often listed as HBB10 in distributor shorthand                                                        |
| Flow rate       | ≥ 90 ml/min (100–140 ml/min typical in listings)                                                      |
| Tubing          | BPT B10 — **3 mm ID × 5 mm OD**                                                                       |
| Rated current   | **0.5 A** at 12 V (6 W)                                                                               |
| Control         | On/off; reversible by polarity reversal                                                               |
| Mounting        | Plate mount, ~105 g, compact cartridge-friendly body                                                  |
| Typical price   | ~$15 USD each on Amazon (Jun 2026)                                                                    |
| Example listing | [Amazon B09F69KYF3](https://www.amazon.com/Kamoer-KPHM100-Peristaltic-Precision-Liquid/dp/B09F69KYF3) |

**Order only the HB (12 V brushed) variant.** Reject **HE** (brushless), **ST** (stepper), and **HA** (24 V).

**Why this pump**

- Matches the project’s target flow band (80–150 ml/min).
- Rated 0.5 A is well inside TB6612FNG limits (1.2 A continuous, 3.2 A peak per channel).
- Tubing size is documented and matches common food-grade silicone/barbs.
- Cost scales to 8–12 pumps within the ~$500 v1 budget.
- Reversible brushed DC motor — no firmware/protocol lock-in.

**Phase 0 order quantity:** **3 pumps** (2 on rig + 1 spare/variance check).

**Still must measure on bench:** stall/startup current under water and syrup, actual ml/min at 12 V, and unit-to-unit spread.

### Backup: Kamoer NKP-12V-S10B

If KPHM100-HB is unavailable: **NKP-12V-S10B** (~$10, [Amazon B07GWJ78FN](https://www.amazon.com/Kamoer-Peristaltic-Hydroponics-Nutrient-Analytical/dp/B07GWJ78FN)). Same **3×5 mm** tubing and polarity reversal; lower flow (~70–80 ml/min) and faster silicone pump-head wear.

### Backup: same model, alternate seller

If the preferred KPHM100 listing is out of stock, order **KPHM100-HB-B10** from Kamoer direct or a reputable distributor — not a visually similar unbranded pump.

Do **not** substitute a different Kamoer series (KDS, KP26, etc.) without re-checking tubing ID/OD and current.

### Rejected for v1 primary (still useful references)

| Candidate                                               | Why not primary                                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Adafruit 1150](https://www.adafruit.com/product/1150)  | ~$15–20 each × 8 blows budget; bundled tubing is **not FDA/USDA rated**; tubing size has changed over revisions (verify 2 mm vs 3.5 mm ID). Good for one-off experiments only. |
| Generic “12 V peristaltic dosing pump” (Amazon no-name) | Inconsistent tubing, current, and QC; INTLLAB-style clones OK for disposable tests only.                                                                                       |
| Kamoer **HE** / **ST** / **HA** variants                | Wrong motor type or voltage for v1 architecture.                                                                                                                               |

## Tubing and fittings

| Item             | Decision                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Pump-head tubing | **BPT B10, 3 mm ID × 5 mm OD** (match KPHM100)                                                       |
| Line tubing      | **McMaster 1972T231** or Quickun — NSF-51 food-grade silicone **3×5 mm**                             |
| Phase 0 fittings | **1/8" PP barb unions** (≈3 mm) + **spring clamps** for 5 mm OD                                      |
| Restricted outlet (bench) | Orifice **smaller than 3 mm line** at pour end — optional dedicated nozzle tip, or interim **1.8 mm ID** silicone coupler (mis-ship from barb-union order; on hand, return pending 2026-06-27). Distinct from barb unions. |
| Driver fallback  | **2× Adafruit DRV8871** if measured stall exceeds TB6612 thermal comfort (dry stall on this pump is 0.9 A; chip rating 1.2 A/ch) |

Red flag: cheap pump “includes food tubing” may not be beverage-safe. Buy explicit food-grade line tubing separately.

## Motor driver

| Item         | Decision                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| Phase 0      | **Pololu TB6612FNG #713** breakout (1 board, 2 pumps). Still the bench carrier. |
| Phase 2 PCB  | **AliExpress SparkFun-pinout TB6612 clone** (item `3256807799494692`), two per module, female 1×8 sockets. Pin order matches SparkFun V11. Measured **15.25 mm** row spacing and **21 × 18 mm** body (21 mm along the pins). PCB sockets already at 15.25 mm. No bare IC. |
| Not a drop-in | Pololu #713 rows are **12.7 mm**. Those boards stay on the bench. They will not plug into the module sockets. |
| Channels     | One TB6612 drives **2 pumps**; Phase 0 uses 1 board for 2 pumps                 |

TB6612FNG is appropriate for this pump. Bench (session 01–02, Pololu carrier, same die family): dry run ~0.21 A, wet stall ~0.33 A, dry stall 0.9 A. The chip rating is 1.2 A average per channel. A seller title that says "1A" is not a tighter limit.

## Power supply

| Stage                   | Recommendation                                   | Notes                                                   |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Phase 0 bench (2 pumps) | **Mean Well GST60A12-P1J** (12 V, **5 A**, 60 W) | ~$19; ~1 A running, 2–3 A headroom for inrush           |
| Full v1 (8 pumps)       | **Mean Well GST120A12-R7B** (12 V, 8.5 A, 102 W) | ~$43–55; 8 × 0.5 A = 4 A continuous running with margin |
| Defer                   | Internal mains PSU, per-module brick             | Stay with external brick for v1                         |

Size final fuse/cutoff after measured max current. Do not assume 0.5 A rated equals stall current.

## Controller (Phase 0)

| Item        | Decision                                                         |
| ----------- | ---------------------------------------------------------------- |
| Board       | **ESP32-S3-DevKitC-1-N8R8** (8 MB flash + 8 MB PSRAM)            |
| Logic power | USB during bench work, or **Pololu D24V5F5** buck from 12 V rail |
| Framework   | **PlatformIO + Arduino** for bench rig                           |
| Phase 2     | Same ESP32-S3 family on main controller PCB or dev board socket  |

## Load cell (required)

| Item           | Decision                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------- |
| Load cell      | **Estardyn 5 kg** bar + **HX711** module (bundled kit; Red E+, Black E−, Green A+, White A−) |
| This unit (2026-08-16) | **75 × 12.75 × 12.75 mm**; holes **5 / 15 / 59 / 69** from load/arrow end; all four **M4 through-tapped**. Geometry: [`hardware/cad/refs/estardyn-load-cell.md`](../hardware/cad/refs/estardyn-load-cell.md). Do not use 80 mm / 15 mm pair / M4–M5 mix. |
| Bench mount    | Printed U-cleat (wire end) + 70 mm pad (arrow end) + taper pins or M4 × 16–20 mm. Not the 110 mm product plates. |
| HX711 GPIO     | **DT → GPIO 15**, **SCK → GPIO 14** (motherboard; `kScaleDout` / `kScaleSck` in controller `config.h`). Bench was 8/9. |
| Use in Phase 0 | Glass/ice, flow-gated dispense validation (Test 9), calibration, no-flow, sanity check      |
| v1 behavior    | Flow-gated pour start when glass present; timed fallback if scale fault or bench gate fails |
| Defer          | Per-ingredient closed-loop mass stop during simultaneous 8-pump pours                       |

## Safety (Phase 0)

| Item              | Decision                                                                            |
| ----------------- | ----------------------------------------------------------------------------------- |
| Main power cutoff | **Single SPST (or equivalent) on mains/PSU input** — cuts 12 V pump feed and logic together unless a later revision splits rails |
| Wiring            | Strip GST60 barrel plug to terminal block; **12 AWG** pump bus; logic ground common |
| Default state     | Rig off when main power open; firmware initializes all outputs off at boot            |

```text
Wall AC → main power cutoff → GST60A12-P1J → inline 5 A fuse → TB6612 VM / pump bus
```

## PCB toolchain

| Item               | Decision                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Schematic + layout | **KiCad 10** (`kicad-cli` for ERC/DRC/export)                                                                                             |
| Phase 2 target     | One **4-pump module** schematic/block set: MCP23017 GPIO expander + TB6612, PWM strapped high (`docs/05-electronics-and-pcb.md`) |
| Phase 0            | Breadboard/breakout for pumps. **Module schematic v1 ERC-clean** (2026-08-16); layout/silkscreen in progress. Fab waits on **DRC**, not an MCP23017 breakout. |

See `hardware/kicad/README.md` for repo layout, `kicad-cli` hooks, and schematic checklist.

## Open questions partially closed

| #    | Question                                       | Status after this doc                                        |
| ---- | ---------------------------------------------- | ------------------------------------------------------------ |
| 1    | Pump model                                     | **KPHM100-HB-B10** — verify sample units on bench            |
| 2    | Pump current                                   | **0.5 A rated** — measure stall/syrup on bench               |
| 3    | Tubing size                                    | **3 mm × 5 mm BPT B10**                                      |
| 4    | Quick disconnects vs barbs                     | **Barbs for Phase 0–1**                                      |
| 5    | Anti-drip vs de-prime                          | **Bench Test 5 + 4b + 9** — flow-gating mitigates pour error |
| 6    | Load cell stable under pump vibration          | **Deferred 2026-08-20** — Test 7.6 + 9 later; bar cal done (session 08) |
| 7–10 | Enclosure, cleaning residue, menu size, labels | **Still require bench/session tests**                        |

## Decision log

| Date       | Decision                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-17 | Lock KPHM100-HB-B10, NKP backup, Pololu TB6612 #713, GST60A12 Phase 0 PSU, ESP32-S3-N8R8, McMaster 1972T231 tubing, Phase 2 custom PCB. |
| 2026-06-18 | Load cell required for v1; flow-gated dispense as v1 default (bench-gated); I2C expander validation before PCB fab; expanded bench protocol. |
| 2026-08-16 | Tests 7–9 / load cell do **not** gate 4-pump module schematic or fab (HX711 on ESP32). Test 10 still gates fab. |
| 2026-08-16 | Module I/O is **MCP23017** GPIO expander (PWM strapped high). PCA9685 rejected. Backup: TCA9539PWR. Test 10 retargeted to Adafruit MCP23017 breakout. |
| 2026-08-16 | PCB toolchain: **KiCad 10** (`hardware/kicad/`, `kicad-cli`). |
| 2026-08-16 | 4-pump module **sockets Pololu TB6612FNG #713** (female 1×8 headers, 0.5" rows) instead of soldering the bare IC. |
| 2026-08-16 | Modules **daisy-chain** on one **Micro-Fit 3.0 2×4**: J1 IN / J2 OUT carry 12 V (pins 1–2), GND (3–4), 3V3, SDA, SCL, `PUMP_BUS_ENABLE`. Not JST-GH. |
| 2026-08-16 | Connector refs compacted: **J1–J2** bus, **J3–J6** motors, **J7–J10** Pololu sockets. No J11–J13. |
| 2026-08-16 | Pump motors **JST-XH 2-pin** (`B2B-XH-A` + female pigtails). Not VH, not PH LiPo cables. No crimp tool. Screw-terminal 5.08 mm is the documented alternate. |
| 2026-08-16 | 4-pump module: **no** I2C ESD, 12 V TVS, motor snubbers, or ferrites. Pololu #713 + short daisy cover v1. IEC clamp would go once at the ESP32, not per module. |
| 2026-08-16 | 4-pump **schematic v1** ERC-clean. Layout/silkscreen in progress. |
| 2026-08-18 | No module VM bulk electrolytic (carrier already decouples VM/VCC). **C1** = 100 nF at MCP23017 VDD. PWM straps **R10–R13** = 10 kΩ (one resistor value with the PDs). |
| 2026-08-20 | Load-cell bar soldered and calibrated (`scalecal 374.76`). Tests 7.2–9 (flow-gate / vibration) **deferred**; not cancelled, not a PCB gate. |
| 2026-08-20 | No MCP23017 breakout. Test 10 I2C bring-up is the **first assembled 4-pump module**. Fab gate is **DRC + schematic safe-off**; accept a spin if ENABLE/RESET/addressing is wrong. |
| 2026-09-12 | **No module daisy.** J2 removed. Each 4-pump box is a **home-run** from the controller. Bus header is Micro-Fit 3.0 **2×3 vertical TH** Molex **43045-0612** (`0430450612`; mate **43025-0600**). Pin map: 1 +12V, 2 GND, 3 `PUMP_BUS_ENABLE`, 4 3V3, 5 SDA, 6 SCL. Controller has **four** paralleled OUTs. Not JST-GH. |
| 2026-10-25 | 4-pump module carrier is an **AliExpress SparkFun-pinout TB6612 clone** (item `3256807799494692`), two per module, not Pololu #713 and not a purchased ROB-14451. Pin order is SparkFun V11 (pin 1 = VM/PWMA end). Bench stays on the Pololu boards. Detail: [`hardware/kicad/4-pump-module-spec.md`](../hardware/kicad/4-pump-module-spec.md). |
| 2026-10-25 | Clone measured: header rows **15.25 mm** center to center, body **21 mm along the pins × 18 mm across the rows**. Module sockets are already 15.25 mm. Do not move them. |
| 2026-10-25 | 4-pump module PCB **ordered** (OSH Park, 3 boards). J1 on that spin is Micro-Fit 3.0 **2×3 right-angle** `43045-0600`. Vertical `43045-0612` does not fit it. Cable plug stays **43025-0600**. |
| 2026-10-25 | Module stuffing parts **ordered** from AliExpress: MCP23017-E/SO, 10 kΩ 0805, 100 nF 0805, Micro-Fit 2×3 right-angle, **F1 1812-2A** PPTC (500 mA LCSC line canceled), **JST-XH 2-pin** 5-set (10 cm). |
| 2026-10-25 | Motherboard parts **ordered** same day: Mini560 **5 V** ×2, Micro-Fit 6-pin **vertical**, KF301-5.0-2P ×10, 2.2 kΩ 0805, plain female **1×22** / **1×6** / **1×4** (TLZWLA; DevKit + HX711). Module still uses right-angle `43045-0600`. |
| 2026-10-29 | Remaining electronics **ordered**: module **1×8** sockets; USB-C **6P**; **SS14**; 3 mm LEDs; **300 Ω** 0805; Micro-Fit **43025** housings + pre-crimped F–F leads; extra JST-XH 2-pin. |
| 2026-10-29 | Main-controller PCB **ordered** for fab. Barbed 1/8" PP unions **deferred**. |
| 2026-10-28 | Motherboard HX711 pins: **DT → GPIO 6**, **SCK → GPIO 7** (was bench 8/9; briefly 15/14 then 7/6). |
| 2026-10-28 | Motherboard I2C: **SDA → GPIO 5**, **SCL → GPIO 4**. `Wire.begin(5, 4)`. |
| 2026-10-28 | Motherboard **LED_STATUS → GPIO 38** (was planned 10). |
| 2026-10-28 | Motherboard **PUMP_BUS_ENABLE → GPIO 18** (bench STBY was 17). |
