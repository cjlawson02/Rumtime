# System Architecture

## Recommended v1 architecture

```text
External bottles/jars
    -> pickup tubes
    -> optional inlet quick disconnects
    -> 4-pump cartridge A, pumps 1-4
    -> 4-pump cartridge B, pumps 5-8
    -> individual outlet tubes
    -> clustered nozzle plate
    -> glass on optional load-cell platform
    -> drip tray

ESP32-S3 main controller
    -> I2C bus to pump modules
    -> pump power enable/cutoff path
    -> HX711/load cell (required for v1)
    -> basic physical controls/status LEDs
```

## Expansion architecture

Design the electronics and enclosure with space for three pump modules:

```text
Module A: pumps 1-4, installed in v1
Module B: pumps 5-8, installed in v1
Module C: pumps 9-12, empty slot or later upgrade
```

Each module should be physically removable. It does not need to be safe to unplug while powered. The safe procedure is:

1. Stop all pump activity.
2. Disable pump power with the hardware cutoff or software-controlled enable.
3. Disconnect the module.
4. Reconnect or replace the module.
5. Re-enable pump power.
6. Re-run pump detection/calibration as needed.

## Why one pump per ingredient

One pump per ingredient is recommended because it avoids:

- Solenoid valve complexity.
- Shared-path flavor carryover.
- Shared-path sanitizer residue.
- Complicated priming logic.
- One failed pump disabling the entire machine.

The cost is more pumps, more tubing, and more connectors. For the 8-12 pump scale, that tradeoff is worth it.

## Why no shared manifold

Do not merge liquid lines before the glass.

A shared manifold creates problems:

- Sticky syrup residue can affect later drinks.
- Citrus/juice can contaminate spirit-only pours.
- Sanitizer and rinse water can hide in dead volume.
- Cleaning a manifold is harder than cleaning individual short outlet tubes.

The recommended approach is a cluster of separate nozzles aimed at the center of the glass.

## Proposed data/control buses

### V1 recommendation

Use:

- I2C from main ESP32 to each 4-pump module.
- One PCA9685-style PWM expander per module.
- Two dual H-bridges per module.
- Shared 12 V pump power distribution.
- Shared logic ground.

This is cheap and practical for short distances under about 3 ft.

### Deferred alternative

If cable runs become longer or noise becomes a serious problem, move to:

- CAN or RS-485 between modules.
- Small microcontroller per 4-pump module.
- Local pump control firmware on each module.

Do not start there unless I2C fails defined tests.

## Electrical block diagram

```text
12 V external power supply
    -> main fuse
    -> pump power cutoff / e-stop
    -> pump module power bus
        -> module A fuse -> H-bridges -> pumps 1-4
        -> module B fuse -> H-bridges -> pumps 5-8
        -> module C fuse -> H-bridges -> pumps 9-12 later
    -> 5 V buck converter
        -> ESP32 board / logic
        -> I2C pullups if appropriate

ESP32-S3
    -> I2C SDA/SCL to modules
    -> module/pump enable line
    -> HX711 load cell amplifier
    -> start/cancel/control buttons
    -> status LEDs or small display later
```

## Liquid block diagram

```text
Bottle 1 -> tube -> pump 1 -> nozzle 1
Bottle 2 -> tube -> pump 2 -> nozzle 2
Bottle 3 -> tube -> pump 3 -> nozzle 3
Bottle 4 -> tube -> pump 4 -> nozzle 4
Bottle 5 -> tube -> pump 5 -> nozzle 5
Bottle 6 -> tube -> pump 6 -> nozzle 6
Bottle 7 -> tube -> pump 7 -> nozzle 7
Bottle 8 -> tube -> pump 8 -> nozzle 8

All nozzles terminate near the same glass center point.
No shared liquid manifold.
```

## Operating modes that affect hardware

| Mode             | Hardware implication                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Prime            | Timed forward over drip tray until nozzle wet; optional flow detect if priming into glass. |
| Dispense         | Timed ml pour; **flow-gated timer start** when glass on load cell; simultaneous optional.  |
| Anti-drip        | Pumps briefly reverse after dispensing.                                                    |
| Drain            | Pumps reverse longer to pull fluid back from outlet lines.                                 |
| Flush            | Pickup tubes placed in water/sanitizer and pumps run forward.                              |
| Calibrate        | Pump runs into measuring cup or glass on load cell.                                        |
| Inventory update | Software subtracts expected dispensed volume from remaining bottle volume.                 |
