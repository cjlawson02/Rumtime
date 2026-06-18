# Rumtime

**Rumtime** is a modular cocktail execution engine: ingredients are registered as services, recipes are resolved at runtime, and beverages are dispensed through a scalable ESP32-powered pump architecture.

This repo will hold Rumtime firmware, PCB/CAD files, and application software as they are developed. For now, it documents the planned v1 hardware design using food-safe tubing, reversible peristaltic pumps, modular pump cartridges, and an ESP32 controller. Software and UI specs are not written yet, except where behavior affects hardware design.

## Current design snapshot

- **Version 1 pump count:** 8 installed pumps.
- **Expansion target:** 12 total pumps via one additional 4-pump module.
- **Control platform:** ESP32-S3 or similar ESP32 board, Wi-Fi only.
- **Pump strategy:** One reversible peristaltic pump per ingredient.
- **Measurement strategy:** Timed dispensing after calibration; optional load cell for glass detection, calibration, and sanity checks.
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
| [`docs/06-flow-calibration-and-inventory.md`](docs/06-flow-calibration-and-inventory.md) | Timed flow calibration, optional load-cell use, and bottle inventory tracking.                 |
| [`docs/07-cleaning-and-food-safety.md`](docs/07-cleaning-and-food-safety.md)             | Cleaning workflow, sanitizer handling, and maintenance assumptions.                            |
| [`docs/08-mechanical-design.md`](docs/08-mechanical-design.md)                           | Enclosure, pump cartridges, drip tray, nozzle cluster, and fridge notes.                       |
| [`docs/09-build-plan-and-verification.md`](docs/09-build-plan-and-verification.md)       | Staged build plan with success criteria and test checks.                                       |
| [`docs/10-open-questions-and-v2.md`](docs/10-open-questions-and-v2.md)                   | Deferred decisions, v2 ideas, and risks.                                                       |
| [`docs/11-sourcing-notes.md`](docs/11-sourcing-notes.md)                                 | Sourcing notes and search terms for pumps, tubing, fittings, electronics, and enclosure parts. |

## Design philosophy

Build the simplest version of Rumtime that can make repeatable drinks, clean up reasonably, and expand without rewiring everything. Avoid premature complexity such as inline flow meters, shared manifolds, fridge drilling, carbonated pumping, or fully custom embedded module networks until the basic 8-pump machine has been validated.

## First prototype goal

Before committing to the full enclosure and PCBs, validate the core liquid path with 2-4 pumps:

1. Dispense 15 ml, 30 ml, and 60 ml targets by time after calibration.
2. Reverse briefly after pours to reduce drips without losing prime.
3. Flush simple syrup and grenadine adequately with warm water.
4. Confirm tubing and nozzles do not retain obvious flavor or clog during a normal session.
5. Confirm a load cell can detect glass presence and obvious no-flow conditions.

If those checks pass, proceed to the 4-pump module PCB and finished enclosure.
