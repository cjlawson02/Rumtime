# Captured Design Decisions

This file is the source of truth for current hardware decisions.

## Project identity

| Topic             | Decision                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Project name      | Rumtime.                                                                                                                        |
| Short description | A modular cocktail execution engine.                                                                                            |
| Tagline           | Compile recipes. Execute cocktails.                                                                                             |
| Repo name         | `rumtime`.                                                                                                                      |
| Naming style      | Software-engineer humor is encouraged in docs and module names when it improves clarity, but hardware docs should stay precise. |

Rationale: Rumtime is short, memorable, software-themed, and still clearly connected to drinks. It supports playful terminology without forcing unclear puns into safety-critical hardware documentation.

## Pump count

| Topic                     | Decision                          |
| ------------------------- | --------------------------------- |
| V1 pump count             | Build for **8 installed pumps**.  |
| Acceptable starting range | 6-8 pumps.                        |
| Expansion target          | 10-12 pumps in near term.         |
| **Design limit**          | **16 pumps** (4× 4-pump modules). |
| Expansion unit            | 4-pump module.                    |

Rationale: 8 pumps supports useful cocktails without making the first build too large. Designing around 4-pump modules allows expansion without changing controller architecture. **16 is the hard ceiling on one I2C bus** — each PCA9685 supports one of four addresses, so four modules max. Beyond 16 would require a bus redesign (mux, CAN, or second I2C bus).

## Pump strategy

| Topic           | Decision                                                     |
| --------------- | ------------------------------------------------------------ |
| Pump type       | Peristaltic pump.                                            |
| Pump assignment | One pump per ingredient.                                     |
| Reverse pumping | Required if reasonably affordable.                           |
| Solenoids       | Avoid for v1.                                                |
| Shared manifold | Avoid.                                                       |
| Phase 0 model   | **Kamoer KPHM100-HB-B10** (12 V brushed, B10 3×5 mm tubing). |
| Phase 0 qty     | 3 pumps (2 rig + 1 spare). Bench-verify before full BOM.     |

Rationale: One pump per ingredient avoids solenoid complexity, cross-contamination, shared-path cleaning, and priming problems. Reversible pumps support anti-drip behavior, draining, and cleaning. KPHM100-HBB10 matches flow, cost, tubing, and TB6612 current targets; see [`12-phase-0-decisions.md`](12-phase-0-decisions.md).

## Measurement strategy

| Topic               | Decision                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Primary measurement | Timed dispensing based on calibrated `ml_per_second`.                                      |
| Pour timing         | **Flow-gated start** when glass on load cell; timed-from-motor-on fallback on scale fault. |
| Priming requirement | Session prime over drip tray; recipe pours tolerate variable line fill via flow-gating.    |
| Flow sensors        | Avoid inline flow meters in v1.                                                            |
| Load cell           | **Required** (5 kg + HX711 under glass).                                                   |
| Accuracy target     | Good enough, not laboratory precise.                                                       |
| Deferred            | Per-ingredient closed-loop mass stop during simultaneous 8-pump pours.                     |

Rationale: Timed dispensing is simple and cheap. Variable line fill after anti-drip makes motor-on timers wrong; flow-gating uses the load cell already required for glass/ice detection. Bench validates vibration stability before locking flow-gate as default — see [`14-bench-test-protocol.md`](14-bench-test-protocol.md) Test 9.

## Glass and dispense position

| Topic              | Decision                                                    |
| ------------------ | ----------------------------------------------------------- |
| Glass location     | One fixed dispense location.                                |
| Ice before pour    | Yes, user may place ice in glass first.                     |
| Glass detection    | **Required** — load cell under glass platform.              |
| Recommended sensor | Load cell serves glass, ice tare, flow-gate, sanity checks. |

## Ingredients

| Ingredient type       | Decision                                       |
| --------------------- | ---------------------------------------------- |
| Spirits               | Support.                                       |
| Liqueurs              | Support.                                       |
| Simple syrup          | Support; flush after session.                  |
| Grenadine             | Support; flush after session.                  |
| Fresh citrus, no pulp | Session-only; flush after use.                 |
| Non-pulpy juices      | Support as session-only or refrigerated later. |
| Pulpy juices          | Skip in v1.                                    |
| Cream/coconut/purées  | Skip in v1.                                    |
| Carbonated mixers     | Manual top-off in v1.                          |

Rationale: Sugary, acidic, and fresh ingredients are manageable if flushed. Pulp and thick dairy/coconut-style ingredients increase clogging and sanitation risk.

## Carbonation

| Topic                  | Decision                                                 |
| ---------------------- | -------------------------------------------------------- |
| Pump carbonated mixers | Not in v1.                                               |
| UI behavior            | Recipe can say "top with soda/tonic/cola/etc."           |
| Possible v2            | Dedicated chilled/carbonated line can be explored later. |

Rationale: Carbonated liquids foam, lose carbonation, and complicate cleaning. Manual top-off gives most of the value with little complexity.

## Bottles and storage

| Topic                | Decision                                                                          |
| -------------------- | --------------------------------------------------------------------------------- |
| Bottle location      | External to machine.                                                              |
| Bottle size          | Flexible; support common 750 ml and 1 L bottles via configuration.                |
| Pickup style         | **Bottle stoppers** with labeled pickup tubes (not bare dropped-in tubes for v1). |
| Bottle caps/adapters | **Labeled stoppers** per bottle; match machine inlet labels.                      |
| Fresh juices         | Connect only during use unless fridge integration is designed later.              |
| Mini fridge          | Defer. Do not drill/plumb in v1.                                                  |

## Cleaning

| Topic                    | Decision                                           |
| ------------------------ | -------------------------------------------------- |
| Cleaning effort          | Moderate is acceptable.                            |
| Rinse/flush              | Required.                                          |
| Sanitizer                | Star San or similar session sanitizer may be used. |
| Permanent sanitizer tank | Not recommended in v1.                             |
| Tubing                   | Replaceable consumable.                            |
| Quick disconnects        | Preferred where budget allows.                     |
| Session-only ingredients | Acceptable.                                        |

## Modular hardware

| Topic        | Decision                                          |
| ------------ | ------------------------------------------------- |
| Module style | 4-pump expansion boards.                          |
| Module cases | 3D printed clean cartridges/cases preferred.      |
| Distance     | Under 3 ft from main controller.                  |
| Hot-swap     | Mechanically swappable, but not powered hot-swap. |
| Connectors   | Cheap/easy is acceptable if rigid and reliable.   |
| Design style | Cheap and practical, visually clean.              |

## Electronics

| Topic               | Decision                                                     |
| ------------------- | ------------------------------------------------------------ |
| Main controller     | ESP32, recommended ESP32-S3.                                 |
| Network             | Wi-Fi only.                                                  |
| Pump voltage        | 12 V recommended by default.                                 |
| Pump control        | On/off acceptable; H-bridge allows reverse and optional PWM. |
| Physical controls   | Bare minimum.                                                |
| Safety cutoff       | Include pump power cutoff/emergency stop.                    |
| Custom PCB          | Expected and acceptable.                                     |
| PCB toolchain       | **Altium Designer** for 4-pump module and future boards.     |
| Phase 0 electronics | TB6612FNG breakout + ESP32-S3-DevKitC-1 on breadboard.       |

## Mechanical design

| Topic             | Decision                                                                          |
| ----------------- | --------------------------------------------------------------------------------- |
| Appearance        | More finished than a raw maker prototype.                                         |
| Fabrication       | 3D printing available; woodworking preferred for visible enclosure.               |
| Footprint         | No hard limit, excluding bottles.                                                 |
| Portability       | Not required.                                                                     |
| Bottle visibility | Bottles separate from machine.                                                    |
| Labeling          | Label above each **inlet barb** on machine; matching label on **bottle stopper**. |
| Drip tray         | Required.                                                                         |
| Nozzle style      | Individual clustered nozzles; removable funnel acceptable if easy to clean.       |

## Budget

| Topic            | Decision                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| V1 budget target | About $500 max, excluding ingredients.                                                                            |
| Pump quality     | Willing to pay more for reliability if value is clear.                                                            |
| Sourcing         | Check McMaster for cheap/appropriate food-contact tubing/fittings, but avoid overbuying premium industrial parts. |
| Priority         | Best bang for buck.                                                                                               |
