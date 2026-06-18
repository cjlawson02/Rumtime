# Parts List and BOM

Prices are rough planning estimates. Verify price, availability, food-contact suitability, and dimensions before ordering.

## Recommended v1 BOM summary

| Category       | Part                                        |            Qty for v1 | Qty for 12-pump max | Notes                                                              |
| -------------- | ------------------------------------------- | --------------------: | ------------------: | ------------------------------------------------------------------ |
| Controller     | ESP32-S3 dev board                          |                     1 |                   1 | Wi-Fi only. Any reliable ESP32-S3 dev board is fine.               |
| Pump modules   | Custom 4-pump PCB                           | 2 installed, design 3 |                   3 | Make all three if PCB quantity pricing is favorable.               |
| Pumps          | 12 V reversible peristaltic pumps           |                     8 |                  12 | Kamoer-style budget pumps are likely best bang for buck.           |
| Motor drivers  | Dual H-bridge driver, TB6612FNG-class       |                     4 |                   6 | Two pumps per driver chip. Verify pump stall current.              |
| I/O expander   | PCA9685-style I2C PWM expander              |                     2 |                   3 | One per 4-pump module.                                             |
| Power supply   | 12 V supply, roughly 10 A or higher         |                     1 |                   1 | External brick preferred for v1. Size after pump current is known. |
| Logic power    | 12 V to 5 V buck converter                  |                     1 |                   1 | Feeds ESP32 and logic as needed.                                   |
| Safety         | Pump power cutoff / e-stop switch           |                     1 |                   1 | Cuts pump power, not necessarily controller power.                 |
| Protection     | Main fuse + per-module fuses/polyfuses      |               several |             several | Protects wiring and modules.                                       |
| Weight sensing | 5 kg or 10 kg load cell + HX711             |                     1 |                   1 | Recommended but optional.                                          |
| Tubing         | Food-contact tubing matched to pump head    |              25-50 ft |              50+ ft | Tubing is a consumable.                                            |
| Fittings       | Barbed fittings, bulkheads, clamps          |               8 lines |            12 lines | Use quick disconnects selectively to control cost.                 |
| Nozzles        | Individual outlet nozzles                   |                     8 |                  12 | No shared manifold.                                                |
| Drip tray      | Removable drip tray and grate               |                     1 |                   1 | 3D printed support plus washable tray is fine.                     |
| Enclosure      | Wood/3D printed/acrylic hybrid              |                     1 |                   1 | Finished-looking, low-cost.                                        |
| Wiring         | Pump wires, I2C cable, terminals/connectors |             as needed |           as needed | Avoid Dupont for permanent wiring.                                 |

## Expected cost bands

| Build                                      | Likely cost range | Notes                                                                  |
| ------------------------------------------ | ----------------: | ---------------------------------------------------------------------- |
| 6-pump budget version                      |          $350-450 | May be easier to hit budget, but less useful.                          |
| 8-pump sensible version                    |          $430-590 | Recommended target. Needs careful connector choices to stay near $500. |
| 8-pump with many premium quick disconnects |          $550-750 | Cleaner but likely over budget.                                        |
| 12-pump polished version                   |          $650-900 | Better as later expansion.                                             |

## Cost-control recommendations

To stay near the $500 target:

- Use Kamoer-style or equivalent budget peristaltic pumps.
- Build custom pump driver PCBs instead of using many breakout boards in the final machine.
- Use barbed fittings and clamps for most internal plumbing.
- Use quick disconnects only at the machine inlet panel or where cleaning benefit is high.
- Use an external 12 V power brick or enclosed supply instead of a complex internal mains supply.
- Use a wood enclosure with 3D printed brackets/cartridges instead of fully machined metal.
- Defer carbonation, fridge plumbing, bottle scales, and fancy displays.

## Pumps

### Recommended starting point

Use 12 V reversible peristaltic pumps with approximately 100 ml/min nominal flow and tubing around 3 mm ID, assuming these are available at a reasonable price.

Search terms:

```text
Kamoer KPHM100 12V peristaltic pump 100 ml/min
12V peristaltic dosing pump food grade tubing
12V reversible peristaltic pump 3mm ID tubing
```

### Pump quantity

Buy:

- 8 pumps for installed v1 channels.
- 2 spare pumps if budget allows.
- 12 total only after the first module design is validated.

### Pump requirements

Each pump should:

- Run from 12 V DC.
- Reverse when polarity is reversed.
- Self-prime reasonably from bottle position to pump.
- Move spirits, syrup, and non-pulpy juice.
- Have replaceable tubing or at least tubing that can be inspected/replaced.
- Draw current within the selected H-bridge and power supply limits.

## Motor driver parts

Use a TB6612FNG-class dual H-bridge if pump current allows.

Per 4-pump module:

- 2 dual H-bridge chips.
- 4 motor connectors.
- 1 module fuse/polyfuse.
- 1 bulk capacitor on motor power.
- Local decoupling capacitors.
- Optional current-test pads.

If pump stall current is too high for TB6612FNG-class drivers, switch to a higher-current H-bridge before final PCB fabrication.

## I/O expander parts

Use a PCA9685-style I2C PWM expander per 4-pump module.

Benefits:

- One short I2C connection controls a whole module.
- Enough outputs for direction, PWM, enable, status LEDs, and spare signals.
- Address pins allow multiple modules on the same bus.

## Power supply

Recommended default:

- 12 V supply, sized after measuring pump current.
- Assume worst-case multiple pumps may run at once.
- Include safety margin.

Planning estimate:

```text
supply_current >= number_of_simultaneous_pumps * measured_pump_current * margin
```

For example, if pumps draw 300 mA running and 8 may run at once:

```text
8 * 0.3 A * 2 margin = 4.8 A minimum
```

A 10 A or larger 12 V supply is a practical starting point, but measure real pumps before finalizing.

## Connectors

### Electrical connectors

Recommended low-cost/clean compromise:

| Connection                     | Suggested connector                    |
| ------------------------------ | -------------------------------------- |
| Main 12 V pump power to module | XT30 or 2-pin pluggable terminal block |
| Logic/I2C to module            | Locking JST-GH/JST-XH or Micro-Fit     |
| Pump motor output              | JST-VH, Micro-Fit, or screw terminal   |
| Buttons/sensors                | JST-GH/JST-XH                          |

Avoid Dupont jumpers for permanent wiring.

### Liquid connectors

Recommended v1 compromise:

| Location            | Suggested fitting                                 |
| ------------------- | ------------------------------------------------- |
| Inside machine      | Barbed fittings and clamps                        |
| Machine inlet panel | Optional hose-barb quick disconnects              |
| Bottle side         | Dropped pickup tubes first; 3D printed caps later |
| Nozzle plate        | Individual removable nozzles                      |

Premium valved quick disconnects are useful but can quickly exceed budget when multiplied by 8-12 lines.

## Tubing

Use food-contact tubing matched to the pump head size. Do not assume the tubing shipped with a cheap pump is appropriate for beverage use.

Consider:

- Silicone beverage tubing for general liquid path.
- Peristaltic-rated tubing for pump heads if the pump uses replaceable tubing.
- Tubing ID large enough to avoid clogging from syrup residue.
- Tubing OD compatible with chosen fittings.

Tubing should be treated as replaceable maintenance material.

## Suggested initial order for prototype only

Before buying the full BOM, validate the liquid path with:

| Part                               |        Qty |
| ---------------------------------- | ---------: |
| 12 V peristaltic pumps             |        2-4 |
| TB6612FNG breakout or equivalent   |        1-2 |
| ESP32 dev board                    |          1 |
| 12 V bench supply or power brick   |          1 |
| Food-contact tubing                |   10-25 ft |
| Barbed fittings and clamps         | small pack |
| HX711 + 5 kg or 10 kg load cell    |          1 |
| Test nozzles or short outlet tubes |        2-4 |
| Waste cup / temporary drip tray    |          1 |

Prototype success should drive final PCB and enclosure decisions.
