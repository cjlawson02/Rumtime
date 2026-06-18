# Sourcing Notes

These are search and sourcing notes, not a locked shopping cart. Verify dimensions, food-contact suitability, electrical ratings, and current prices before ordering.

## Pumps

Search terms:

```text
Kamoer KPHM100 12V peristaltic pump 100 ml/min
Kamoer 12V peristaltic pump 3mm ID 5mm OD
12V reversible peristaltic dosing pump food grade tubing
Adafruit 12V peristaltic liquid pump
```

Selection criteria:

- 12 V DC.
- Reversible by polarity reversal.
- Around 80-150 ml/min is reasonable for v1.
- Affordable enough to buy 8 plus spares.
- Tubing size known.
- Pump body mountable in a 3D printed cartridge.
- Current draw compatible with selected H-bridge.

## Tubing

Search sources:

- McMaster-Carr.
- Food/beverage tubing suppliers.
- Homebrew suppliers.
- Lab tubing suppliers.

Search terms:

```text
food grade silicone tubing 3mm ID 5mm OD
peristaltic pump tubing food beverage
NSF 51 silicone tubing beverage
BPT peristaltic tubing food grade
```

Notes:

- Match tubing ID/OD to pump and fittings.
- Do not assume tubing included with cheap pumps is beverage-safe.
- Consider separate pump-head tubing and line tubing if the pump supports replacement.
- Buy extra tubing for replacement and cleaning experiments.

## Fittings

Search terms:

```text
hose barb bulkhead fitting 3mm 1/8 beverage
food grade hose barb fitting silicone tubing
small hose spring clamps stainless
CPC quick disconnect hose barb food beverage
Colder quick disconnect 1/8 hose barb
```

Budget approach:

- Barbs and clamps for internal lines.
- Optional quick disconnects at machine inlet panel.
- Avoid premium valved quick disconnects everywhere until v1 is proven.

## Electronics

Search terms:

```text
ESP32-S3 dev board
TB6612FNG motor driver IC
TB6612FNG breakout
PCA9685 PWM driver IC
PCA9685 breakout
HX711 load cell amplifier
5kg load cell bar
12V 10A power supply
12V to 5V buck converter
```

Notes:

- Breakout boards are fine for prototype.
- Custom PCB is preferred for final 4-pump modules.
- Measure pump current before committing to motor driver.
- Use real locking connectors for final wiring.

## Connectors

Search terms:

```text
XT30 connector panel mount
JST-GH connector kit
JST-XH connector kit
JST-VH 2 pin connector
Molex Micro-Fit 3.0 kit
pluggable terminal block 2 pin 5.08mm
```

Recommended use:

| Use               | Connector candidates                |
| ----------------- | ----------------------------------- |
| Module 12 V power | XT30, pluggable terminal, Micro-Fit |
| Module logic      | JST-GH, JST-XH, Micro-Fit           |
| Pump motors       | JST-VH, Micro-Fit, screw terminal   |
| Sensors/buttons   | JST-GH/JST-XH                       |

## Power and safety

Search terms:

```text
12V 10A power supply enclosed
12V 12.5A power supply Mean Well
12V external power brick 10A
panel mount emergency stop switch DC
inline blade fuse holder
polyfuse resettable fuse 12V motor
```

Notes:

- External 12 V brick is simpler and safer for v1.
- Include a main fuse.
- Include a pump power cutoff.
- Keep electronics dry and isolated from liquid path.

## Mechanical parts

Search terms:

```text
small stainless drip tray
bar drip tray stainless small
acrylic sheet black 1/8
HDPE sheet food safe cutting board
heat set inserts M3
M3 screw assortment
rubber feet enclosure
```

Suggested materials:

- Wood for visible outer shell.
- 3D printed pump cartridges and brackets.
- Acrylic/HDPE/washable plastic for wet-side surfaces.
- Stainless or plastic removable drip tray.

## Prototype shopping list

Buy first, before full 8-pump build:

```text
2-4 candidate pumps
1 ESP32 dev board
1-2 TB6612FNG breakout boards
1 12V supply or bench supply access
10-25 ft tubing
barbed fittings and clamps
1 HX711 + load cell
simple nozzle/outlet tubing
```

Only after this works:

```text
PCB parts for 4-pump module
8 total pumps
full tubing/fitting quantity
enclosure materials
nozzle plate parts
drip tray
module connectors
```
