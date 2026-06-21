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
| Driver fallback  | **2× Adafruit DRV8871** if measured stall exceeds TB6612 thermal comfort (~1 A/ch on Pololu carrier) |

Red flag: cheap pump “includes food tubing” may not be beverage-safe. Buy explicit food-grade line tubing separately.

## Motor driver

| Item         | Decision                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| Phase 0      | **Pololu TB6612FNG #713** breakout (1 board, 2 pumps)                           |
| Alternatives | SparkFun ROB-14451, Adafruit #2448 — Pololu is best documented/value            |
| Phase 2 PCB  | **TB6612FNG IC** on custom 4-pump Altium module (same silicon, proven on bench) |
| Channels     | One TB6612 drives **2 pumps**; Phase 0 uses 1 board for 2 pumps                 |

TB6612FNG is appropriate **if measured stall current stays under ~1 A per pump**. KPHM100’s 0.5 A rated draw is encouraging; bench measurement is still mandatory before PCB fab.

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
| Load cell      | **SparkFun 5 kg TAL220B** (SEN-14729) + **HX711** (SEN-13879)                               |
| Use in Phase 0 | Glass/ice, flow-gated dispense validation (Test 9), calibration, no-flow, sanity check      |
| v1 behavior    | Flow-gated pour start when glass present; timed fallback if scale fault or bench gate fails |
| Defer          | Per-ingredient closed-loop mass stop during simultaneous 8-pump pours                       |

## Safety (Phase 0)

| Item              | Decision                                                                            |
| ----------------- | ----------------------------------------------------------------------------------- |
| Pump power cutoff | **Inline ATC fuse** (5 A Phase 0) → **12 V 20 A SPST rocker** on pump + feed        |
| Wiring            | Strip GST60 barrel plug to terminal block; **12 AWG** pump bus; logic ground common |
| Default state     | Pumps off when cutoff open; firmware initializes all outputs off at boot            |

```text
Wall AC → GST60A12-P1J → inline 5 A fuse → rocker switch → TB6612 VM / pump bus
ESP32: USB (or buck from unswitched 12 V for logic-on when pumps off)
```

## PCB toolchain

| Item               | Decision                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Schematic + layout | **Altium Designer**                                                                                                                       |
| Phase 2 target     | One **4-pump module** schematic/block set, derived from bench-validated TB6612 + PCA9685 architecture in `docs/05-electronics-and-pcb.md` |
| Phase 0            | Breadboard/breakout only — no PCB order yet                                                                                               |

See `hardware/altium/README.md` for repo layout and schematic checklist.

## Open questions partially closed

| #    | Question                                       | Status after this doc                                        |
| ---- | ---------------------------------------------- | ------------------------------------------------------------ |
| 1    | Pump model                                     | **KPHM100-HB-B10** — verify sample units on bench            |
| 2    | Pump current                                   | **0.5 A rated** — measure stall/syrup on bench               |
| 3    | Tubing size                                    | **3 mm × 5 mm BPT B10**                                      |
| 4    | Quick disconnects vs barbs                     | **Barbs for Phase 0–1**                                      |
| 5    | Anti-drip vs de-prime                          | **Bench Test 5 + 4b + 9** — flow-gating mitigates pour error |
| 6    | Load cell stable under pump vibration          | **Bench Test 7.6 + 9** — gates flow-gate as v1 default       |
| 7–10 | Enclosure, cleaning residue, menu size, labels | **Still require bench/session tests**                        |

## Decision log

| Date       | Decision                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-17 | Lock KPHM100-HB-B10, NKP backup, Pololu TB6612 #713, GST60A12 Phase 0 PSU, ESP32-S3-N8R8, McMaster 1972T231 tubing, Altium Phase 2 PCB.        |
| 2026-06-18 | Load cell required for v1; flow-gated dispense as v1 default (bench-gated); PCA9685 I2C validation before Altium fab; expanded bench protocol. |
