# Rumtime

**Rumtime** is a modular cocktail execution engine: ingredients are registered as services, recipes are resolved at runtime, and beverages are dispensed through a scalable ESP32-powered pump architecture.

This repo holds Rumtime documentation, Phase 0 bench-rig firmware, and Altium PCB specifications. CAD and full product firmware are still in progress. The v1 hardware design uses food-safe tubing, Kamoer KPHM100-class reversible peristaltic pumps, modular 4-pump cartridges, and an ESP32-S3 controller. Application UI specs are not written yet.

## Current design snapshot

- **Version 1 pump count:** 8 installed pumps.
- **Expansion target:** 12 total pumps via one additional 4-pump module.
- **Control platform:** ESP32-S3 or similar ESP32 board, Wi-Fi only.
- **Pump strategy:** One reversible peristaltic pump per ingredient.
- **Measurement strategy:** Timed dispensing after calibration; **load cell required** for glass/ice detection, **flow-gated pour start**, and sanity checks.
- **Carbonation:** Do not pump carbonated mixers in v1. Software should instruct the user to top off manually.
- **Cleaning:** Moderate-effort cleaning with warm-water flush and Star San/session sanitizer workflow.
- **Budget target:** About $500 max for v1, excluding liquor and ingredients.
- **Build style:** Finished-looking countertop dispenser, with external bottles and replaceable tubing.

## Document map

| File                                                                                     | Purpose                                                                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                                                 | Coding-agent and contributor behavior rules based on the requested Karpathy-style guidelines.  |
| [`docs/00-project-brief.md`](docs/00-project-brief.md)                                   | Scope, goals, assumptions, and non-goals.                                                      |
| [`docs/01-decisions.md`](docs/01-decisions.md)                                           | All captured design decisions from the planning conversation.                                  |
| [`docs/02-system-architecture.md`](docs/02-system-architecture.md)                       | Hardware architecture and module layout.                                                       |
| [`docs/03-parts-list-bom.md`](docs/03-parts-list-bom.md)                                 | Initial parts list with budget notes and sourcing guidance.                                    |
| [`docs/04-plumbing-and-fluid-path.md`](docs/04-plumbing-and-fluid-path.md)               | Tubing, fittings, bottles, nozzles, and ingredient compatibility.                              |
| [`docs/05-electronics-and-pcb.md`](docs/05-electronics-and-pcb.md)                       | Electrical design and 4-pump PCB guidance.                                                     |
| [`docs/06-flow-calibration-and-inventory.md`](docs/06-flow-calibration-and-inventory.md) | Timed flow calibration, flow-gated dispense, load cell, and inventory tracking.                |
| [`docs/07-cleaning-and-food-safety.md`](docs/07-cleaning-and-food-safety.md)             | Cleaning workflow, sanitizer handling, and maintenance assumptions.                            |
| [`docs/08-mechanical-design.md`](docs/08-mechanical-design.md)                           | Enclosure, pump cartridges, drip tray, nozzle cluster, and fridge notes.                       |
| [`docs/09-build-plan-and-verification.md`](docs/09-build-plan-and-verification.md)       | Staged build plan with success criteria and test checks.                                       |
| [`docs/10-open-questions-and-v2.md`](docs/10-open-questions-and-v2.md)                   | Deferred decisions, v2 ideas, and risks.                                                       |
| [`docs/11-sourcing-notes.md`](docs/11-sourcing-notes.md)                                 | Sourcing notes and search terms for pumps, tubing, fittings, electronics, and enclosure parts. |
| [`docs/12-phase-0-decisions.md`](docs/12-phase-0-decisions.md)                           | Research-backed Phase 0 part decisions (pump, PSU, Altium).                                    |
| [`docs/13-phase-0-mini-bom.md`](docs/13-phase-0-mini-bom.md)                             | Phase 0 shopping list (~2-pump bench rig).                                                     |
| [`docs/14-bench-test-protocol.md`](docs/14-bench-test-protocol.md)                       | Bench tests, pass criteria, and session log template.                                          |
| [`firmware/bench-rig/`](firmware/bench-rig/)                                             | ESP32-S3 + TB6612 bring-up firmware (PlatformIO).                                              |
| [`hardware/altium/`](hardware/altium/)                                                   | Altium project layout and 4-pump module schematic spec.                                        |

## Design philosophy

Build the simplest version of Rumtime that can make repeatable drinks, clean up reasonably, and expand without rewiring everything. Avoid premature complexity such as inline flow meters, shared manifolds, fridge drilling, carbonated pumping, or fully custom embedded module networks until the basic 8-pump machine has been validated.

## Current status

**Next action:** Order the [Phase 0 mini-BOM](docs/13-phase-0-mini-bom.md), build the 2-pump bench rig, and run [`docs/14-bench-test-protocol.md`](docs/14-bench-test-protocol.md).

Decisions are locked in [`docs/12-phase-0-decisions.md`](docs/12-phase-0-decisions.md) (KPHM100-HBB10 pump, TB6612 breakout, ESP32-S3-DevKitC-1, Altium for Phase 2 PCB).

## First prototype goal

Before committing to the full enclosure and Altium PCB fab, validate the core liquid path with 2–4 pumps:

1. Dispense 15 ml, 30 ml, and 60 ml targets by time after calibration.
2. Validate **flow-gated dispense** vs timed-only on de-primed and post–anti-drip lines (Test 9).
3. Reverse briefly after pours to reduce drips; document sequential pour drift (Test 4b).
4. Flush simple syrup and grenadine adequately with warm water.
5. Confirm tubing and nozzles do not retain obvious flavor or clog during a normal session.
6. Confirm load cell detects glass, ice tare, flow onset, and no-flow conditions (Tests 7–9).
7. Validate **PCA9685 I2C** pump control before Altium fab (Test 10).

If those checks pass, implement the 4-pump module in Altium (`hardware/altium/`) and proceed to the finished enclosure.
