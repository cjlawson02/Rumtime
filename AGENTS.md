# Contributor and Agent Guidelines

These rules are adapted from the requested Karpathy-style guidelines. They apply to future software, firmware, PCB, CAD, and documentation work in the Rumtime project.

## 1. Think before implementing

Do not assume silently.

Before changing code, PCB files, CAD files, or docs:

- State assumptions explicitly when they affect the design.
- Surface tradeoffs instead of hiding them.
- Present multiple interpretations when the request is ambiguous.
- Prefer asking a focused clarification over implementing the wrong thing.
- Push back when a simpler approach solves the problem.

For Rumtime, examples include:

- Do not add inline flow meters unless the timed-pump plus scale approach has failed a defined test.
- Do not add a shared liquid manifold just because it makes the nozzle cluster smaller.
- Do not design for carbonation in the pump path until a v2 decision explicitly asks for it.
- Do not drill a fridge unless there is a confirmed safe pass-through path.

## 2. Simplicity first

Minimum design that satisfies the requirement.

Avoid:

- Speculative features.
- Extra abstraction for one-off use.
- Configurability that has not been requested.
- Complex bus/module schemes when I2C over a short distance is enough.
- Overly clever cleaning automation before the manual cleaning workflow is proven.

Preferred approach:

- Start with 2-4 pumps to validate flow and cleaning.
- Build 4-pump modules only after the simple prototype passes tests.
- Use timed dispensing before adding closed-loop control.
- Use manual top-off for carbonated mixers before pumping them.

## 3. Surgical changes

Touch only what is needed.

When editing existing project files:

- Do not refactor unrelated code.
- Do not reformat unrelated files.
- Do not rename modules, signals, parts, or connectors unless the task requires it.
- Match existing style even if a different style is preferred.
- Remove only imports, variables, functions, or files made unused by the current change.
- Mention unrelated dead code or questionable design; do not delete it without approval.

Every changed line should trace directly to the stated goal.

## 4. Goal-driven execution

Convert tasks into verifiable goals.

Examples:

- "Add pump calibration" becomes: save ml/sec per pump, dispense three target volumes, verify measured output stays within the selected tolerance.
- "Add glass detection" becomes: detect empty platform, glass only, glass plus ice, and missing glass before dispensing.
- "Design 4-pump PCB" becomes: produce schematic, check motor current paths, check connector pinouts, run DRC/ERC, and verify one module can be addressed independently.
- "Improve cleaning" becomes: flush syrup line, sanitize line, dry/purge line, and inspect for residue or odor after a session.

For multi-step work, use this format:

```text
1. Step -> verify: check
2. Step -> verify: check
3. Step -> verify: check
```

## Documentation and parts (Phase 0–1)

Project docs (`docs/`, mini-BOM, sourcing notes) are **unvalidated prototypes**. They record intent and search starting points, not locked procurement.

When helping with shopping, sourcing, or substitutions:

- Prefer **functional specs** (voltage, current, tubing ID/OD, motor type, safety interlocks) over matching a named SKU or “the doc says buy X.”
- Treat listed retailers, part numbers, and price bands as **examples** until bench results under `docs/14-bench-test-protocol.md` (and dated notes in `docs/bench-results/`) confirm them.
- **Equivalent parts are fine** when they meet the same requirements and tradeoffs are stated (e.g. generic 5 kg bar + HX711 vs SparkFun; any honest 12 V 5 A PSU vs Mean Well GST60A12-P1J).
- Do **not** reject a reasonable substitute solely because it is not the exact item in `docs/13-phase-0-mini-bom.md` or `docs/12-phase-0-decisions.md`.

Still non-negotiable even while docs are provisional:

- Safety and architecture guardrails below (food-contact intent, pump cutoff, no shared liquid manifold, etc.).
- Wrong pump **motor/voltage/tubing** variants (e.g. stepper/24 V when the bench path assumes 12 V brushed).
- Skipping fuse/cutoff or guessing beverage-wetted materials.

After measured bench data, update decisions and BOM to reflect what was actually validated — that is when specific parts earn “default” status.

## Project-specific guardrails

- Food-contact parts must be intentionally selected, not guessed.
- Liquids and electronics must be physically separated.
- Pump power must have a hardware cutoff.
- Tubing is considered a consumable.
- Fresh juice is a session-only ingredient unless a refrigeration plan is explicitly designed.
- Carbonated mixers are manual top-off in v1.
- Inventory tracking is software-estimated unless and until bottle scales are added.
- Hot-swappable means mechanically convenient, not safe to unplug while pump power is live.
