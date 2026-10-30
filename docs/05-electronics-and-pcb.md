# Electronics and PCB Design

## Recommended electronics stack

```text
ESP32-S3 main controller
    -> I2C bus
    -> MCP23017 GPIO expander on each 4-pump module
    -> TB6612FNG-class H-bridges (PWM strapped high)
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

- One **MCP23017** I2C GPIO expander.
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
    -> SDA/SCL/GND/Vlogic (3.3 V)
    -> PUMP_BUS_ENABLE -> both TB6612 STBY
    -> MCP23017
        -> pump 1–4 IN1/IN2
        -> optional LEDs/spares

12 V module power connector
    -> fuse/polyfuse
    -> H-bridge #1 -> pump 1 and pump 2
    -> H-bridge #2 -> pump 3 and pump 4

TB6612 PWMA/PWMB strapped to Vlogic through 10 kΩ (no speed PWM in v1)
Carrier local caps cover VM/VCC; module C1 is 100 nF at the MCP23017.
```

## H-bridge choice

Use a TB6612FNG-class dual H-bridge if measured pump current allows. The 4-pump module sockets an **AliExpress SparkFun-pinout clone** (item `3256807799494692`, two per board). Pin order is the SparkFun V11 order. Measured header rows are **15.25 mm**; the body is **21 × 18 mm**. Detail: [`hardware/kicad/4-pump-module-spec.md`](../hardware/kicad/4-pump-module-spec.md). Bench boards are Pololu #713.

Benefits:

- Two pumps per chip.
- Forward and reverse control.
- Common and inexpensive.

v1 does **not** use PWM speed control. Strap PWMA/PWMB to 3.3 V through **10 kΩ**; stop with IN1=IN2=low.

Before final PCB fabrication:

1. Measure normal running current for the selected pump.
2. Measure startup/stall current if possible.
3. Confirm the driver has enough margin.
4. If not, select a higher-current H-bridge.

## MCP23017 signal allocation

v1 is on/off + reverse only. PCA9685 (PWM expander) is **rejected**. Pin map lives in [`hardware/kicad/4-pump-module-spec.md`](../hardware/kicad/4-pump-module-spec.md).

| MCP23017 | Signal |
| -------- | ------ |
| GPA0–GPA7 | Pumps 1–4 IN1/IN2 |
| GPB0–GPB1 | Optional LEDs |
| GPB2–GPB7 | Spare |

**STBY** is a shared ESP32 `PUMP_BUS_ENABLE` on the logic connector, not an expander pin. Addresses **0x20–0x23** (A2=GND, A1/A0 jumpers). Backup IC: TCA9539PWR (not footprint-compatible).

## Safe default behavior

The board should default to pumps off during boot and reset.

Include:

- Pull-downs or safe default states where needed.
- A module enable or output-enable signal.
- Main pump power cutoff independent of software (single **main power** switch — no separate pump-bus cutoff).
- Firmware behavior that initializes all pumps off before doing anything else.

## Power design

Recommended default:

```text
12 V supply
    -> main fuse
    -> main power cutoff
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

- 5 kg load cell + HX711 module (Estardyn 5 kg bar + HX711 kit, or equivalent).
- Mounted under glass platform with mechanical isolation.

Use cases:

- Glass presence detection — block dispense without glass.
- Tare after glass plus ice is placed.
- **Flow-gated pour start** — begin ml timers when `d(weight)/dt` exceeds threshold (see [`06-flow-calibration-and-inventory.md`](06-flow-calibration-and-inventory.md)).
- Calibration by weight.
- Pre-gate no-flow abort and post-pour mass sanity check.

Do not rely on the load cell to identify which pump is wrong if multiple pumps are running simultaneously. Flow-gating uses one **global** onset signal.

The load cell is **not** on the 4-pump module PCB. Tests 7–9 gate **flow-gate as v1 default**, not module schematic or fab. Timed fallback remains if vibration blocks reliable detection.

## Physical controls

Bare minimum controls:

| Control                    | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| Main power cutoff / e-stop | Hardware stop for the rig (single switch).                   |
| Start/confirm button       | Optional physical action button.           |
| Cancel/stop button         | Stops current operation.                   |
| Status LED                 | Indicates ready/dispensing/error/cleaning. |

A display is optional and can be deferred if the UI is phone/browser based.

## Connector recommendations

### Module bus (12 V + logic)

One Molex Micro-Fit 3.0 **2×3** vertical through-hole (`43045-0612` / `0430450612` on the module, mate `43025-0600`) **home-run per box**. Controller has **four** paralleled OUTs. 12 V, GND, 3.3 V, I2C, and `PUMP_BUS_ENABLE` share that connector. **No cartridge daisy (no J2).** Do not use JST-GH for 12 V.

Pin map: [`hardware/kicad/4-pump-module-spec.md`](../hardware/kicad/4-pump-module-spec.md) J1.

### Pump motors

**Default:** JST-XH 2-pin (`B2B-XH-A` header + female XH pigtail spliced to each KPHM100 lead). Polarized, 3 A vs ~0.9 A dry stall. Buy 10 pigtails for 8 pumps + 2 spare. No crimp tool.

**Not:** JST-VH (old schematic family; scarce pigtails), JST-PH / Adafruit “JST 2-pin” LiPo cables (2.0 mm, will not mate), Dupont.

**Documented alternate:** 5.08 mm pluggable screw terminal (Phoenix MSTB / 2EDG) if you want to skip the splice.

Avoid Dupont jumpers in the final machine.

## PCB layout notes

- Separate motor current paths from sensitive logic where practical.
- Use wide traces or pours for pump power and ground.
- Do not add extra VM electrolytics on the 4-pump module; the TB6612 carrier already has local VM/VCC caps.
- Place C1 (100 nF) at MCP23017 VDD/VSS.
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
4. Run schematic ERC (`hardware/kicad/scripts/check.sh`).
5. Run PCB DRC (`hardware/kicad/scripts/check.sh --drc`).
6. Verify mounting hole locations with printed paper or test plate.
7. Confirm safe default states with schematic review (IN1/IN2 pulldowns, STBY PD, MCP23017 /RESET, PWM strap).
8. Confirm main power cutoff removes pump power.
9. MCP23017 I2C bring-up is Test 10 **on the first assembled module** (not a pre-fab breakout). See [`14-bench-test-protocol.md`](14-bench-test-protocol.md).
