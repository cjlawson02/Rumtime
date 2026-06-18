# Phase 0 Mini-BOM

Shopping list for the **2-pump bench rig** only. See [`12-phase-0-decisions.md`](12-phase-0-decisions.md) for rationale.

Verify prices and sellers before ordering. Links are examples, not endorsements.

## Order now (Phase 0)

|      Qty | Item               | Part / spec                                          |   ~USD | Where                                                                                                 |
| -------: | ------------------ | ---------------------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------- |
|        3 | Peristaltic pump   | **Kamoer KPHM100-HB-B10** (12 V brushed, B10 3×5 mm) |    $46 | [Amazon B09F69KYF3](https://www.amazon.com/Kamoer-KPHM100-Peristaltic-Precision-Liquid/dp/B09F69KYF3) |
|        1 | Motor driver       | **Pololu TB6612FNG #713**                            |     $5 | [Pololu](https://www.pololu.com/product/713)                                                          |
|        1 | Controller         | **ESP32-S3-DevKitC-1-N8R8**                          |    $18 | [Adafruit #5336](https://www.adafruit.com/product/5336), Mouser                                       |
|        1 | Pump PSU           | **Mean Well GST60A12-P1J** (12 V 5 A)                |    $19 | [Bravo Electro](https://www.bravoelectro.com/gst60a12-p1j.html), Mouser                               |
| 15–20 ft | Line tubing        | **McMaster 1972T231** — 3×5 mm FDA silicone          | $15–30 | McMaster                                                                                              |
|        1 | Tubing alt.        | Quickun 3×5 mm silicone roll (~10 ft)                |     $9 | Amazon B08BR4ZR4S                                                                                     |
|      2 m | Pump-head spare    | Kamoer **BPT B10** replacement                       |  $5–10 | Kamoer / Amazon                                                                                       |
|        1 | Barb fittings      | Quickun **1/8" PP barb union** 5-pack                |     $7 | Amazon B08L5DTRCK                                                                                     |
|        1 | Clamps             | **Koolance CLM-03N-10P** or McMaster **5346K441**    |    $10 | Koolance / McMaster                                                                                   |
|        1 | Fuse               | Inline ATC holder + **5 A** fuses                    |     $5 | Amazon                                                                                                |
|        1 | Cutoff switch      | **12 V 20 A SPST** rocker                            |     $3 | Amazon                                                                                                |
|        1 | Wire               | **12 AWG** red/black + hookup wire kit               |    $10 | Amazon                                                                                                |
|        1 | Protoboard         | Breadboard + jumpers                                 |     $8 | Amazon                                                                                                |
|        2 | Test bottles       | Water + syrup/grenadine ingredients                  |    $10 | Grocery                                                                                               |
|        1 | Graduated cylinder | 100 ml min.                                          |     $8 | Amazon                                                                                                |

### Optional but recommended

|  Qty | Item       | Part                                  | ~USD | Where    |
| ---: | ---------- | ------------------------------------- | ---: | -------- |
|    1 | Load cell  | SparkFun **SEN-14729** (5 kg TAL220B) |  $16 | SparkFun |
|    1 | HX711      | SparkFun **SEN-13879**                |   $5 | SparkFun |
|    1 | Logic buck | Pololu **D24V5F5** (12 V → 5 V)       |   $9 | Pololu   |

## Phase 0 cost band

| Tier                  |    Est. total |
| --------------------- | ------------: |
| Without load cell     | **~$136–164** |
| With load cell + buck | **~$157–185** |

## Backup pump (if KPHM100 unavailable)

|  Qty | Item             | Part                                      | ~USD | Where                                                                                                        |
| ---: | ---------------- | ----------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------ |
|    3 | Peristaltic pump | **Kamoer NKP-12V-S10B** (3×5 mm silicone) |  $30 | [Amazon B07GWJ78FN](https://www.amazon.com/Kamoer-Peristaltic-Hydroponics-Nutrient-Analytical/dp/B07GWJ78FN) |

## Buy for full v1 later

| Item         | Part                                     | When               |
| ------------ | ---------------------------------------- | ------------------ |
| PSU          | **Mean Well GST120A12-R7B** (12 V 8.5 A) | Phase 2+           |
| Pumps        | KPHM100-HB-B10 ×5+                       | After Phase 1 pass |
| PCA9685      | Per 4-pump Altium module                 | Phase 2            |
| TB6612FNG ×2 | On Altium PCB per module                 | Phase 2            |
| Fuse         | **10 A** on pump bus                     | 8-pump assembly    |
| Connectors   | XT30, JST-GH, JST-VH                     | Phase 2 harness    |

## Defer until Phase 1+

PCA9685 breakout, 3D cartridge/nozzle CAD, CPC quick disconnects, enclosure, internal mains PSU, DRV8871 (only if TB6612 fails stall test).

## Receive checklist

1. Pump label: **12 V brushed (HB)**, not HE/ST/HA.
2. Caliper-check tubing **3×5 mm**.
3. Spin pump both directions from bench supply before ESP32 wiring.
4. Log stall/run current in [`14-bench-test-protocol.md`](14-bench-test-protocol.md).
