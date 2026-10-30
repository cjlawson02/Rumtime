# Phase 0 Mini-BOM

Shopping list for the **2-pump bench rig** only. See [`12-phase-0-decisions.md`](12-phase-0-decisions.md) for rationale.

Verify prices and sellers before ordering. Links are examples, not endorsements.

**Bench inventory (2026-07-18):** Operator has **8× correct KPHM100-HB-B10 12 V pumps** (P1+P2 bench-validated; 6 not yet validated), **4× Pololu TB6612FNG** (1 on 2-pump rig, 3 spare), and **2× 5 m rolls** of 3×5 mm line tubing (**10 m** total). The two wrong 24 V pumps were returned. Mini-BOM qty below is the minimum for Phase 0, not an outstanding order list.

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
|        1 | Cutoff switch      | **Main power SPST** (mains or PSU input — not a separate pump-bus switch) |     $3 | Amazon / hardware store                                                                               |
|        1 | Wire               | **12 AWG** red/black + hookup wire kit               |    $10 | Amazon                                                                                                |
|        1 | Protoboard         | Breadboard + jumpers                                 |     $8 | Amazon                                                                                                |
|        2 | Test bottles       | Water + syrup/grenadine ingredients                  |    $10 | Grocery                                                                                               |
|        1 | Graduated cylinder | 100 ml min.                                          |     $8 | Amazon                                                                                                |
|        1 | Load cell + HX711  | **Estardyn 5 kg** bar + HX711 module (bundled kit)   |    ~$15 | Amazon / AliExpress class                                                                          |
|        1 | Terminal block     | **2-pin 5.08 mm** pluggable (GST60 pump bus)         |     $3 | Amazon / Mouser                                                                                       |
|        1 | USB-C cable        | ESP32-S3-DevKitC-1 programming                       |     $5 | (often on hand)                                                                                       |

### Optional but recommended

|  Qty | Item            | Part                            | ~USD | Where             |
| ---: | --------------- | ------------------------------- | ---: | ----------------- |
|    1 | Logic buck      | Pololu **D24V5F5** (12 V → 5 V) |   $9 | Pololu            |
|    1 | Driver fallback | Adafruit **DRV8871** breakout   |   $8 | Adafruit          |
|    1 | Nozzle test tip | Short barb + restricted outlet  |   $5 | McMaster / Amazon — or interim while on hand: mis-shipped **1.8 mm ID** silicone coupler on outlet (see receive checklist §2) |

## Phase 0 cost band

| Tier                         |    Est. total |
| ---------------------------- | ------------: |
| Core (includes load cell)    | **~$157–175** |
| With buck + DRV8871 + nozzle | **~$174–197** |

## Backup pump (if KPHM100 unavailable)

|  Qty | Item             | Part                                      | ~USD | Where                                                                                                        |
| ---: | ---------------- | ----------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------ |
|    3 | Peristaltic pump | **Kamoer NKP-12V-S10B** (3×5 mm silicone) |  $30 | [Amazon B07GWJ78FN](https://www.amazon.com/Kamoer-Peristaltic-Hydroponics-Nutrient-Analytical/dp/B07GWJ78FN) |

## Buy before PCB fab (not Phase 0 order)

None. MCP23017 breakout **skipped** (2026-08-20): Test 10 is I2C bring-up on the first assembled module. Fab still waits on **DRC**.

## Buy for full v1 later

| Item         | Part                                     | When               |
| ------------ | ---------------------------------------- | ------------------ |
| PSU          | **Mean Well GST120A12-R7B** (12 V 8.5 A) | Phase 2+           |
| Pumps        | KPHM100-HB-B10 ×8                        | On hand 2026-07-18 |
| MCP23017     | Per 4-pump KiCad module (SOIC-28)        | Phase 2            |
| AliExpress TB6612 clone ×2 | SparkFun-pinout module carrier, item `3256807799494692`. Measured rows 15.25 mm, body 21 × 18 mm. Not the Pololu #713 boards on the bench. | Phase 2 |
| Fuse         | **10 A** on pump bus                     | 8-pump assembly    |
| Connectors   | Micro-Fit **2×3** vertical (`43045-0612`) bus; **JST-XH 2-pin** ×10 (motors) | Phase 2 harness    |

Only P1+P2 are bench-validated; inspect and variance-test the remaining 6 before assembly.

## Defer until Phase 1+

3D cartridge/nozzle CAD, CPC quick disconnects, enclosure, internal mains PSU. DRV8871 only if bench stall test fails (order with Phase 0 if you want a fast swap).

## Receive checklist

1. Pump label: **12 V brushed (HB)**, not HE/ST/HA or **24 V** variants. _(Bench 2026-06-27: 2 of 4 shipment were 24 V — returned.)_
2. Fittings: confirm **barbed** unions, not smooth silicone couplers. _(Bench 2026-06-27: Quickun B08L5DTRCK class shipped **smooth silicone couplers** — **not yet returned** (post office pending). Measured **1.8 mm ID** vs **3 mm** line. **Roles:** barb unions = inline tube joins + clamps; restricted outlet = smaller orifice at pour end. Coupler is **not** a barb union; on outlet (3 mm tube in one end, pour from other) it **does** restrict vs open 3 mm tube. Re-order **barbed** unions for mid-line joins. Re-run flow cal and anti-drip after any outlet restriction is added — sessions 01–02 numbers were on open outlet.)_
3. Tubing **3×5 mm** — caliper optional if visual fit and prime/pour pass on bench. _(Operator: waived 2026-06-27.)_
4. Spin pump both directions from bench supply before ESP32 wiring.
5. Log stall/run current in [`14-bench-test-protocol.md`](14-bench-test-protocol.md).
