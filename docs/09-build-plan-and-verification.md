# Build Plan and Verification

This plan follows goal-driven execution: every step has a verification check.

## Phase 0: Confirm critical parts

1. Select candidate pump.
   - Verify: pump is reversible, 12 V, affordable, and physically measurable.
2. Select tubing and fitting size.
   - Verify: tubing fits pump and fittings without leaks or kinks.
3. Select motor driver.
   - Verify: measured pump current is within driver limits with margin.
4. Select power supply strategy.
   - Verify: supply can run expected simultaneous pumps with margin.

Exit criteria:

- One pump can move water forward and backward under controller or bench control.
- Tubing/fittings are physically compatible.
- Pump current is known well enough for driver selection.

## Phase 1: 2-4 pump liquid prototype

Build a temporary rig with 2-4 pumps.

1. Wire pumps to driver breakout or temporary PCB.
   - Verify: each pump runs forward, reverse, and stops reliably.
2. Prime lines from bottles/jars.
   - Verify: each line primes without leaks or collapsing tubing.
3. Dispense by time.
   - Verify: 15 ml, 30 ml, and 60 ml test pours are repeatable enough.
4. Test anti-drip reverse.
   - Verify: nozzle drip is reduced without losing prime.
5. Test syrup and grenadine.
   - Verify: pump can dispense and flush them without obvious clogging.
6. Test warm-water flush.
   - Verify: visible residue clears from lines/nozzles.
7. Test load cell and flow-gating.
   - Verify: detects glass, glass plus ice, flow-gated vs timed pour (Tests 7–9).
8. Validate I2C pump path before PCB order.
   - Verify: PCA9685 breakout drives pumps; bus stable under motor load (Test 10).

Exit criteria:

- At least two pumps pass repeatability tests.
- Syrup/grenadine can be flushed acceptably.
- Anti-drip reverse has a workable setting; Test 4b trend documented.
- Load cell Tests 7–9 pass or flow-gate fallback documented.
- No critical issue requires changing the architecture.

## Phase 2: First 4-pump module PCB

**Prerequisite:** Phase 0–1 exit including Test 10 (PCA9685 I2C path).

Design and fabricate one 4-pump module PCB.

1. Create schematic.
   - Verify: ERC passes and safe default pump-off behavior is reviewed.
2. Create layout.
   - Verify: DRC passes and motor current paths are sized appropriately.
3. Confirm connectors.
   - Verify: connector pinouts match wiring harness plan.
4. Confirm mounting.
   - Verify: board holes align with a printed/measured cartridge mockup.
5. Assemble one board.
   - Verify: no shorts; logic power and 12 V rails test correctly.
6. Test with one pump.
   - Verify: forward/reverse/stop works.
7. Test with four pumps.
   - Verify: all channels work and simultaneous operation does not brown out/reset logic.

Exit criteria:

- One 4-pump module runs four pumps reliably.
- Module address selection works.
- Module can be physically mounted in a cartridge.

## Phase 3: Mechanical cartridge and nozzle prototype

1. Design 4-pump cartridge.
   - Verify: pumps mount securely and tubing can be serviced.
2. Design nozzle plate.
   - Verify: all outputs aim into the glass and plate is removable.
3. Design drip tray area.
   - Verify: drips fall into removable tray, not electronics.
4. Design tube inlet strain relief.
   - Verify: bottle tubes cannot tug directly on pump fittings.

Exit criteria:

- One cartridge can be installed/removed.
- Tubing can be routed without kinks.
- Nozzle plate and drip tray are cleanable.

## Phase 4: 8-pump v1 assembly

1. Build two 4-pump modules.
   - Verify: each module works independently.
2. Install modules into enclosure.
   - Verify: wet side and electronics are physically separated.
3. Connect 8 liquid paths.
   - Verify: no leaks during priming and flush.
4. Run full calibration.
   - Verify: every pump has stored ml/sec and passes target pour tests.
5. Run recipe simulation with water.
   - Verify: multiple pumps dispense into glass without missing target badly.
6. Run real ingredient session.
   - Verify: drinks are acceptable and cleanup is moderate.

Exit criteria:

- Machine can make a useful set of drinks with 8 ingredients.
- Cleaning workflow is acceptable enough to repeat.
- Inventory tracking can warn before low bottles.

## Phase 5: 12-pump expansion readiness

1. Install or mock third module slot.
   - Verify: physical space, power connector, and I2C address path exist.
2. Connect third module electrically without pumps.
   - Verify: system can detect/address the module.
3. Add pumps 9-12 later.
   - Verify: power supply and wiring can handle additional load.

Exit criteria:

- Expansion to 12 pumps does not require redesigning the enclosure, controller, or power distribution.

## Calibration test matrix

For each pump:

| Test          |     Target | Pass condition                                              |
| ------------- | ---------: | ----------------------------------------------------------- |
| Small pour    |      15 ml | Good-enough repeatability.                                  |
| Standard pour |      30 ml | Good-enough repeatability.                                  |
| Large pour    |      60 ml | Good-enough repeatability.                                  |
| Anti-drip     |   Per pump | No excessive dripping; Test 4b without re-prime documented. |
| Flow-gate     | Per recipe | Gated vs timed error on de-primed line (Test 9).            |
| Flush         |   Per pump | No visible residue after cleaning cycle.                    |
| Reverse       |   Per pump | Pump reverses without leaks or tube collapse.               |

Define numeric tolerances after initial prototype results. Do not over-optimize before measuring real pump behavior.

## Cleaning verification

After a real ingredient session:

1. Flush syrup line.
   - Verify: outlet runs clear and is not sticky at nozzle.
2. Flush grenadine line.
   - Verify: color mostly clears and no visible residue remains.
3. Flush citrus/juice line.
   - Verify: no visible residue or pulp remains.
4. Sanitize per label.
   - Verify: contact time and drain/purge steps are completed.
5. Inspect next day.
   - Verify: no obvious odor, residue, or sticky nozzle.

## Safety verification

Before using with ingredients:

1. Activate pump power cutoff during pump operation.
   - Verify: pumps stop.
2. Reset ESP32 during operation.
   - Verify: pumps stop or remain off.
3. Disconnect/reconnect logic with pump power off.
   - Verify: no unexpected pump activation after reconnect.
4. Simulate no glass (load cell required).
   - Verify: dispensing is blocked or warning is shown.
5. Flow-gated pour with de-primed line.
   - Verify: gated pour within tolerance or fallback documented.
6. Leak test with water.
   - Verify: leaks do not reach electronics.

## Do not skip

- Pump current measurement.
- Tubing/fitting compatibility test.
- Syrup/grenadine cleaning test.
- Anti-drip reverse tuning.
- Load cell flow-gate validation (or documented fallback).
- PCA9685 I2C bench test before PCB fab.
- Leak test with water before alcohol/sugar.
- Hardware pump power cutoff.
