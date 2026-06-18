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

## Project-specific guardrails

- Food-contact parts must be intentionally selected, not guessed.
- Liquids and electronics must be physically separated.
- Pump power must have a hardware cutoff.
- Tubing is considered a consumable.
- Fresh juice is a session-only ingredient unless a refrigeration plan is explicitly designed.
- Carbonated mixers are manual top-off in v1.
- Inventory tracking is software-estimated unless and until bottle scales are added.
- Hot-swappable means mechanically convenient, not safe to unplug while pump power is live.
