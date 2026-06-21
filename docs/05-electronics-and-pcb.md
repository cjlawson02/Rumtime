# Electronics and PCB Design

## Recommended electronics stack

```text
ESP32-S3 main controller
    -> I2C bus
    -> PCA9685 on each 4-pump module
    -> TB6612FNG-class H-bridges
    -> 12 V peristaltic pumps
```

## Why ESP32-S3

The project only requires Wi-Fi, GPIO, I2C, and basic control. ESP32-S3 is a practical default because it is modern, common, inexpensive, and available on many dev boards.

Any reliable ESP32 board can work if it has:

- Wi-Fi.
- I2C.
- Enough GPIO for enable, buttons, LEDs, and HX711.
- Stable power input.
- Good development support.

## Main controller responsibilities

Hardware-level responsibilities:

- Enable/disable pump power or pump commands.
- Communicate with pump modules over I2C.
- Read HX711/load cell (required for v1).
- Read physical buttons.
- Drive status LEDs or small display if added.
- Store or access pump calibration and inventory data through software.

## 4-pump module responsibilities

Each 4-pump module should include:

- One I2C addressable control IC.
- Four reversible motor channels.
- Motor power input.
- Logic/I2C connector.
- Per-module protection.
- Pump motor connectors.
- Address selection.
- Mounting holes.

## Per-module block diagram

```text
Logic connector
    -> SDA/SCL/GND/Vlogic
    -> PCA9685
        -> pump 1 direction/PWM signals
        -> pump 2 direction/PWM signals
        -> pump 3 direction/PWM signals
        -> pump 4 direction/PWM signals
        -> optional LEDs/spares

12 V module power connector
    -> fuse/polyfuse
    -> bulk capacitor
    -> H-bridge #1 -> pump 1 and pump 2
    -> H-bridge #2 -> pump 3 and pump 4
```

## H-bridge choice

Use a TB6612FNG-class dual H-bridge if measured pump current allows.

Benefits:

- Two pumps per chip.
- Forward and reverse control.
- Optional PWM speed control.
- Common and inexpensive.

Before final PCB fabrication:

1. Measure normal running current for the selected pump.
2. Measure startup/stall current if possible.
3. Confirm the driver has enough margin.
4. If not, select a higher-current H-bridge.

## PCA9685 signal allocation

One possible allocation per 4-pump module:

| PCA9685 channel | Signal              |
| --------------: | ------------------- |
|               0 | Pump 1 IN1          |
|               1 | Pump 1 IN2          |
|               2 | Pump 1 PWM/enable   |
|               3 | Pump 2 IN1          |
|               4 | Pump 2 IN2          |
|               5 | Pump 2 PWM/enable   |
|               6 | Pump 3 IN1          |
|               7 | Pump 3 IN2          |
|               8 | Pump 3 PWM/enable   |
|               9 | Pump 4 IN1          |
|              10 | Pump 4 IN2          |
|              11 | Pump 4 PWM/enable   |
|              12 | Status LED or spare |
|              13 | Status LED or spare |
|              14 | Spare               |
|              15 | Spare               |

If the H-bridge design only needs two logic pins plus a shared PWM/enable per channel, adjust the allocation accordingly. Keep the mapping documented on the schematic.

## Safe default behavior

The board should default to pumps off during boot and reset.

Include:

- Pull-downs or safe default states where needed.
- A module enable or output-enable signal.
- Main pump power cutoff independent of software.
- Firmware behavior that initializes all pumps off before doing anything else.

## Power design

Recommended default:

```text
12 V supply
    -> main fuse
    -> pump power cutoff
    -> module power distribution
    -> buck converter to 5 V
    -> ESP32/dev board/logic
```

Use adequate wire gauge for the pump power bus. Size fuses for the wire and expected load.

## External versus internal power supply

For v1, prefer an external 12 V brick or a properly enclosed supply.

Reasons:

- Less mains wiring inside a wet-adjacent appliance.
- Easier debugging.
- Easier replacement.
- Simpler enclosure design.

If using an internal AC mains supply later, isolate it physically from the wet side and follow appropriate electrical safety practices.

## Load cell electronics

**Required for v1:**

- 5 kg load cell (SparkFun SEN-14729 or equivalent).
- HX711 amplifier.
- Mounted under glass platform with mechanical isolation.

Use cases:

- Glass presence detection — block dispense without glass.
- Tare after glass plus ice is placed.
- **Flow-gated pour start** — begin ml timers when `d(weight)/dt` exceeds threshold (see [`06-flow-calibration-and-inventory.md`](06-flow-calibration-and-inventory.md)).
- Calibration by weight.
- Pre-gate no-flow abort and post-pour mass sanity check.

Do not rely on the load cell to identify which pump is wrong if multiple pumps are running simultaneously. Flow-gating uses one **global** onset signal.

Bench must pass Tests 7–9 in [`14-bench-test-protocol.md`](14-bench-test-protocol.md) before locking flow-gate as default; timed fallback remains if vibration blocks reliable detection.

## Physical controls

Bare minimum controls:

| Control                    | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| Pump power cutoff / e-stop | Hardware stop for pumps.                   |
| Start/confirm button       | Optional physical action button.           |
| Cancel/stop button         | Stops current operation.                   |
| Status LED                 | Indicates ready/dispensing/error/cleaning. |

A display is optional and can be deferred if the UI is phone/browser based.

## Connector recommendations

### Module power

Use one of:

- XT30.
- 2-pin pluggable terminal block.
- Micro-Fit power connector.

### Module logic

Use one of:

- JST-GH.
- JST-XH if size is acceptable.
- Micro-Fit signal connector.

Signals:

```text
GND
Vlogic
SDA
SCL
optional PUMP_ENABLE / OE
optional module interrupt / detect
```

### Pump motors

Use one of:

- JST-VH.
- Micro-Fit.
- Pluggable screw terminal.

Avoid Dupont jumpers in the final machine.

## PCB layout notes

- Separate motor current paths from sensitive logic where practical.
- Use wide traces or pours for pump power and ground.
- Place bulk capacitance near H-bridge motor supply.
- Place decoupling capacitors near IC power pins.
- Add mounting holes that match the cartridge design.
- Add test pads for 12 V, logic voltage, ground, SDA, SCL, and pump outputs.
- Label pump outputs clearly on silkscreen.
- Label I2C address jumpers clearly.
- Keep wet-side connectors physically away from logic connectors.

## Pre-fabrication checks

Before ordering PCB revisions:

1. Confirm pump current and driver margin (dry **and** wet stall on bench).
2. Confirm connector pinouts against wiring harness plan.
3. Confirm tubing/pump physical dimensions against cartridge CAD.
4. Run schematic ERC.
5. Run PCB DRC.
6. Verify mounting hole locations with printed paper or test plate.
7. Confirm safe default states with schematic review (IN1/IN2 pulldowns, STBY, PCA9685 power-on outputs).
8. Confirm main power cutoff removes pump power.
9. **PCA9685 I2C bench validation** complete (Test 10 in [`14-bench-test-protocol.md`](14-bench-test-protocol.md)).
10. Flow-gated dispense pass or documented fallback in `docs/bench-results/`.
