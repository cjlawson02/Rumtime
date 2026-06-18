# Open Questions and V2 Ideas

## Open questions before buying full BOM

1. ~~Which exact pump model gives the best cost/reliability/flow tradeoff?~~ **Resolved for Phase 0:** Kamoer **KPHM100-HBB10** — bench-verify samples. See [`12-phase-0-decisions.md`](12-phase-0-decisions.md).
2. What is the measured pump current under water, syrup, and startup/stall conditions? *(Rated 0.5 A; stall TBD on bench — use [`14-bench-test-protocol.md`](14-bench-test-protocol.md).)*
3. ~~What tubing size is actually compatible with the chosen pump head?~~ **Resolved:** BPT B10, **3 mm ID × 5 mm OD**.
4. ~~Are cheap quick disconnects acceptable, or are barbs/clamps better for v1?~~ **Resolved for Phase 0–1:** barbs + clamps; selective QD later.
5. Does anti-drip reverse work without de-priming the line?
6. Does the load cell remain stable with a glass plus ice during pump vibration?
7. What enclosure dimensions are needed after real pump/cartridge measurements?
8. How much residue remains after syrup/grenadine/citrus cleaning tests?
9. ~~Is 8 pumps enough for the desired drink menu, or should the enclosure start with 12 physical nozzle positions?~~ **Resolved:** Start with **8 installed pumps**; design enclosure and electronics for **16 pumps max** (four 4-pump module slots, four PCA9685 addresses on one I2C bus). Pre-plan physical space for 16 inlet barbs and nozzles; populate only 8 at first build.
10. ~~How should pump/bottle labels be handled so setup is obvious?~~ **Resolved:** **Dual labels** — engraved/printed label above each **inlet barb** on the machine panel; matching label on each **bottle stopper** where the pickup tube enters. Tube color optional later.

## V2 ideas

Do not implement these until v1 works.

### Mini fridge integration

Possible goal:

- Keep fresh juices chilled while connected.

Concerns:

- Safe tube pass-through.
- Condensation.
- Cleaning.
- Bottle organization.
- Fridge drilling risk.

Recommended approach:

- Avoid drilling unless safe path is known.
- Use existing drain/gasket/pass-through if possible.
- Treat fridge integration as a separate design project.

### Carbonated mixer support

Possible goal:

- Pump or dispense soda/tonic/cola automatically.

Concerns:

- Foam.
- Loss of carbonation.
- Cleaning sticky soda lines.
- Need for chilled storage.
- Different flow behavior than still liquids.

Recommended approach:

- Keep manual top-off in v1.
- Later test one dedicated carbonated line before expanding.

### Bottle-level sensing

Possible goal:

- Detect actual bottle contents instead of estimating inventory.

Options:

- Bottle scales.
- Float/level sensors.
- Vision/manual barcode workflows.
- More careful inventory reconciliation using glass load-cell data.

V1 decision: use software-estimated inventory.

### More accurate closed-loop pouring

Possible goal:

- Sequentially pour each ingredient until target mass is reached.

Concerns:

- Slower.
- Needs density assumptions or per-ingredient density.
- Needs stable load-cell readings during pump vibration.

Recommended path:

1. Use load cell for calibration.
2. Use load cell for final sanity check.
3. Add sequential scale-assisted mode only if timed pours are not good enough.

### Better module network

Possible goal:

- Robust long cable runs and smart modules.

Options:

- CAN bus.
- RS-485.
- Small MCU per module.

V1 decision: I2C is acceptable for short runs under about 3 ft.

### Premium fittings

Possible goal:

- Cleaner ingredient swaps and less mess.

Options:

- Valved CPC/Colder-style quick disconnects.
- Panel-mounted bulkhead quick disconnects.
- Labeled bottle harnesses.

V1 decision: use these selectively because cost multiplies quickly across 8-12 lines.

## Known risks

| Risk                                | Mitigation                                                                |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Cheap pumps vary in flow rate       | Calibrate each pump and keep spares.                                      |
| Tubing wears and flow drifts        | Treat tubing as consumable; recalibrate periodically.                     |
| Syrup dries in nozzles              | Use warm-water flush and removable nozzle plate.                          |
| Citrus/juice sanitation issues      | Use session-only handling and clean after use.                            |
| I2C noise with motors               | Keep cables short, use proper grounding, add decoupling, lower I2C speed. |
| Pump startup current exceeds driver | Measure current before final PCB; choose driver accordingly.              |
| Liquid leaks into electronics       | Separate wet/dry compartments; leak test with water.                      |
| Reverse pump de-primes line         | Tune anti-drip reverse per pump/ingredient.                               |
| Inventory estimate drifts           | Use low-volume reserve and manual refill confirmations.                   |
| Project overcomplicates             | Follow AGENTS.md: simplicity first and goal-driven verification.          |
