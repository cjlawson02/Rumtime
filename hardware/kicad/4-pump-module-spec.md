# 4-Pump Module — KiCad Schematic Spec

Pre-layout specification for the Phase 2 **4-pump module** PCB. Implement as hierarchical sheets in KiCad (`4-pump-module/4-pump-module.kicad_sch`).

**Status (2026-10-25):** Schematic **v1 ERC-clean**. PCB **ordered** from OSH Park (3 boards). Driver carrier is an **AliExpress SparkFun-pinout TB6612 clone** (item `3256807799494692`). Measured: header rows **15.25 mm** center to center, outline **21 mm along the pins × 18 mm across the rows**. Socket pitch already matches. Silkscreen on the module still says Pololu. **No module daisy** — one Micro-Fit **2×3 right-angle** (`43045-0600`) home-run per box. Test 10 is I2C on the first assembled board (no MCP23017 breakout).

Architecture reference: [`docs/05-electronics-and-pcb.md`](../../docs/05-electronics-and-pcb.md). Load cell / HX711 is on the **main controller**, not this module.

v1 pours are **on/off + reverse** (timed `ml/s` at 12 V). Do **not** PWM the pumps. The module uses an **I2C GPIO expander**, not a PWM chip.

**Default expander:** MCP23017-E/SO (SOIC-28). **Backup:** TCA9539PWR (not footprint-compatible). **Rejected:** PCA9685 (PWM expander; unused in v1).

## Block diagram

```text
Controller J_BUSn  ── cable ──►  J1  Micro-Fit 2×3 right-angle (43045-0600)
                                  ├─ pin 1  +12V  → F1 → both carriers' VM
                                  ├─ pin 2  GND
                                  ├─ pin 3  PUMP_BUS_ENABLE → both TB6612 STBY
                                  ├─ pin 4  3V3
                                  ├─ pin 5  SDA
                                  └─ pin 6  SCL

  No J2. Controller has four paralleled 2×3 OUTs (J_BUS1–4).

  → F1 tap → carrier VM (local caps on the clone; confirm before omitting module bulk)
  → U1 MCP23017 + C1 100 nF at VDD
  → U2 TB6612 clone socket → J3 PUMP1, J4 PUMP2
  → U3 TB6612 clone socket → J5 PUMP3, J6 PUMP4
```

TB6612 **PWMA/PWMB** strapped to **VLOGIC** through **10 kΩ** (not expander pins).

## Schematic sheets (recommended)

| Sheet | Contents |
| ----- | -------- |
| `Power_In` | F1 (12 V from J1; **no** TVS). Extra VM electrolytic only if the clone has no bulk cap. |
| `Logic_In` | J1, addr jumpers, `PUMP_BUS_ENABLE` + STBY PD (**no** I2C ESD) |
| `GPIO_Expander` | U1 MCP23017, decoupling, /RESET, A0–A2 straps |
| `Drivers_A` | U2 clone sockets, pump 1–2 connectors, PWM strap, IN1/IN2 PDs |
| `Drivers_B` | U3 clone sockets, pump 3–4 connectors, PWM strap, IN1/IN2 PDs |
| `Mounting` | Holes, keep-out notes (non-electrical) |

## MCP23017 → TB6612 signal map

Document on schematic:

| MCP23017 | Net name | Destination |
| -------- | -------- | ----------- |
| GPA0 | P1_IN1 | U2 AIN1 |
| GPA1 | P1_IN2 | U2 AIN2 |
| GPA2 | P2_IN1 | U2 BIN1 |
| GPA3 | P2_IN2 | U2 BIN2 |
| GPA4 | P3_IN1 | U3 AIN1 |
| GPA5 | P3_IN2 | U3 AIN2 |
| GPA6 | P4_IN1 | U3 BIN1 |
| GPA7 | P4_IN2 | U3 BIN2 |
| GPB0–GPB1 | LED / spare | Optional status |
| GPB2–GPB7 | spare | DNP / test pads |

**STBY** is **not** an expander pin. Shared ESP32 `PUMP_BUS_ENABLE` on J1 → both TB6612 STBY, with 10 kΩ PD to GND. Do not strap STBY high.

PWM is **not** on the expander.

## Driver carrier — SparkFun-pinout clone

Two boards per module, U2 = pumps 1–2, U3 = pumps 3–4. The part on hand is an **AliExpress clone** of the SparkFun dual TB6612 breakout, item [`3256807799494692`](https://www.aliexpress.us/item/3256807799494692.html). Same pin order as SparkFun V11 ([ROB-14451](https://www.sparkfun.com/sparkfun-motor-driver-dual-tb6612fng-1a.html) / Eagle in [sparkfun/Motor_Driver-Dual_TB6612FNG](https://github.com/sparkfun/Motor_Driver-Dual_TB6612FNG)). Different manufacturer. Outline is not the SparkFun 20.3 mm square.

The TB6612 die is rated **1.2 A average / 3.2 A peak per channel**, VM **2.5–13.5 V** operating (**15 V** absolute max), VCC **2.7–5.5 V**. A 12 V pump rail and 3.3 V logic are in range. Seller titles that say "1A" or "15 V max" are copying the SparkFun page, not a tighter spec.

Measured on the clone, 2026-10-25:

| | |
| --- | --- |
| Pin order | SparkFun V11, from the VM/PWMA end |
| Header pitch | 2.54 mm, two 1×8 rows |
| Row spacing | **15.25 mm** center to center. J7–J8 and J9–J10 are already there. Do not move them. |
| Outline | **21 mm** along the pin row, **18 mm** across the rows |
| Pololu #713 | 12.7 mm rows. Bench only. Will not plug into these sockets. |

Eight pins at 2.54 mm span 17.78 mm. A board 18 mm along that axis would put the end holes off the edge, so the 21 mm side is the pin row and the 18 mm side is across the rows. That leaves about **1.6 mm** of board past each end-pin center and about **1.4 mm** outside each header centerline.

Bench current was measured on a Pololu #713. Same die family: dry run ~0.21 A, wet stall ~0.33 A, dry stall 0.9 A. All three are under 1.2 A per channel. Dry stall is the close case; it is a jam, not a pour. The die has thermal shutdown. This carrier is slightly smaller than SparkFun's 20 mm square across the rows. 0.9 A on one channel is still the number that was accepted.

Still worth one look at the clone, not another measurement of the outline:

- Silkscreen at the end where **VM sits beside PWMA**. That end is socket pin 1.
- Parts on VM. A fat capacitor (tantalum or electrolytic) is local bulk. Only tiny ceramics means add a module VM cap.

### Plug-in orientation

On the genuine SparkFun board, pin 1 of the two headers are at opposite ends. Clones that copy that layout do the same. Module socket pin 1 (square pad) is the **VM / PWMA** end of **both** rows. Seat the carrier so those two labels face the square pads.

If the motor-header square pad is GND, it lands in socket pin 8. Match the silkscreen, not the square pads.

Reading both headers from the VM/PWMA end (this is the existing schematic net order):

| Pin | Control J7 / J9 | Power J8 / J10 | U2 net | U3 net |
| --- | --------------- | -------------- | ------ | ------ |
| 1 | PWMA | VM | P1_PWM / VMOT | P3_PWM / VMOT |
| 2 | AIN2 | VCC | P1_IN2 / +3V3 | P3_IN2 / +3V3 |
| 3 | AIN1 | GND | P1_IN1 / GND | P3_IN1 / GND |
| 4 | STBY | A01 | `PUMP_BUS_ENABLE` / P1_M+ | `PUMP_BUS_ENABLE` / P3_M+ |
| 5 | BIN1 | A02 | P2_IN1 / P1_M− | P4_IN1 / P3_M− |
| 6 | BIN2 | B02 | P2_IN2 / P2_M− | P4_IN2 / P4_M− |
| 7 | PWMB | B01 | P2_PWM / P2_M+ | P4_PWM / P4_M+ |
| 8 | GND | GND | GND | GND |

Do not reorder these nets unless the clone silkscreen disagrees. SparkFun's own motor-header pin 1 is the GND end, not VM. Use the silkscreen.

### On the carrier, and not on it

Genuine SparkFun V11 has a 10 µF 20 V tantalum plus 0.1 µF on VM, 0.1 µF on VCC, and **no** reverse FET. This clone is not that board. Look at it (step 4 above) before keeping "no module VM electrolytic."

What does not depend on the clone PCB:

- On-die freewheel diodes and thermal shutdown, if the chip is a real TB6612FNG.
- The TB6612's internal **200 kΩ** pulldown on STBY, IN1/IN2, and PWM. Keep the module **10 kΩ** STBY pulldown and the **10 kΩ** PWM straps (R10–R13). The strap into 200 kΩ sits near **3.1 V**, above the TB6612 VIH minimum of **2.0 V**.
- Reverse-plug protection stays the polarized Micro-Fit and the fixed-polarity brick. Do not add a series FET or a 12 V TVS unless the clone has no local bulk and VM rings, or a later test asks for it.

Keepout is the measured **21 × 18 mm** body on the 15.25 mm sockets: about 1.6 mm past each end pin and 1.4 mm outside each header row. That body still covers **J1** and **J3** (driver 1) and **U1** and **J5** (driver 2). SOIC and 0805 clear a board up on female sockets. Check the Micro-Fit and JST-XH housings against socket height (~8.5 mm for a typical 2.54 mm socket) before fab.

Phase 0 bench stays on the Pololu #713 boards already wired. Same chip family, different footprint.

## I2C address

A2 strapped GND. A1/A0 jumpers or solder bridges. Silkscreen 0x20–0x23.

| A1 | A0 | 7-bit address |
| -- | -- | ------------- |
| 0 | 0 | 0x20 |
| 0 | 1 | 0x21 |
| 1 | 0 | 0x22 |
| 1 | 1 | 0x23 |

MCP23017 allows 0x20–0x27 (eight devices). v1 **16-pump ceiling is mechanical/power**, not I2C addressing. Bias A0–A2; do not leave them floating.

## Connectors (v1 targets)

| Ref | Type | Notes |
| --- | ---- | ----- |
| J1 | Molex Micro-Fit 3.0 **2×3** right-angle TH (`43045-0600`) | Bus **IN** — 12 V + logic. No OUT / no J2. |
| J3–J6 | **JST-XH 2-pin** (`B2B-XH-A`) | Motor outputs, silkscreen P1–P4. Polarized, 3 A. Not VH, not PH. |
| J7 | 1×8 pin socket | Carrier 1 control. Pin 1 = PWMA (`U2-CTRL`) |
| J8 | 1×8 pin socket | Carrier 1 power/motors. Pin 1 = VM (`U2-PWR`) |
| J9 | 1×8 pin socket | Carrier 2 control. Pin 1 = PWMA (`U3-CTRL`) |
| J10 | 1×8 pin socket | Carrier 2 power/motors. Pin 1 = VM (`U3-PWR`) |

**J1 pin map** (Molex pad numbers; do not put 12 V on JST-GH):

| Pin | Net | Notes |
| --- | --- | --- |
| 1 | +12V | One pin. One module (~0.8 A run) is inside Micro-Fit rating. |
| 2 | GND | Next to +12V |
| 3 | `PUMP_BUS_ENABLE` | Both carrier STBY |
| 4 | 3V3 | Logic |
| 5 | SDA | |
| 6 | SCL | |

| | |
| --- | --- |
| Symbol | `Connector_Generic:Conn_02x03_Counter_Clockwise` (as placed; **harness uses Molex pad numbers above**) |
| Footprint | `Connector_Molex:Molex_Micro-Fit_3.0_43045-0600_2x03_P3.00mm_Horizontal` |
| MPN | Molex **43045-0600** (tin, snap-in peg, right-angle). Gold: **0601** / **0602**, same footprint. Vertical **43045-0612** does not match this board. |
| Mate | Receptacle **43025-0600** + crimps, or a 6-pos precrimped Micro-Fit cable |

MCP23017 **/RESET** stays on the board (pull-up to 3.3 V), not on this cable.

Harness: **one home-run per module**. Controller J_BUS1–4 → boxes A–D J1. **No cartridge daisy (no J2).** Unique A0/A1 per box. I2C pull-ups **once on the controller**. **F1** fuses local VM only.

**J3–J6 KiCad (place four of these):**

| | Name |
| --- | --- |
| Symbol | `Connector:Conn_01x02_Pin` |
| Footprint | `Connector_JST:JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical` |
| MPN | `B2B-XH-A(LF)(SN)` |
| Values | `PUMP1` … `PUMP4` (or P1–P4) |

Pin 1 = square pad = **M+** (keep red = pin 1 on every pigtail). Alternate if cables must exit the board edge: `JST_XH_S2B-XH-A_1x02_P2.50mm_Horizontal`. Do **not** use `JST_VH_B2P-VH` or a PH (2.0 mm) footprint.

Harness: female XH 2-pin pigtails spliced/heatshrunk to each KPHM100 lead. No crimp tool. Buy 10 (8 + 2 spare). Zip-tie strain relief on the cartridge — the latch is not the strain member. Documented alternate: 5.08 mm pluggable screw terminal (Phoenix MSTB / 2EDG).

## Protection (v1)

**Add nothing** for ESD, RF, or extra motor snubbing on this PCB.

The clone's local caps and any VM reverse FET are unverified; see the carrier section. The TB6612 has on-die freewheel diodes. MCP23017 is 4 kV HBM. The home-run is a short in-machine cable, not a user port. PWM is strapped high (no chopping). A SMAJ12A/SMBJ15A clamp sits **above** the TB6612 15 V abs max, so it is not real protection. J1 is polarized and the brick is fixed polarity.

Do **not** place: I2C ESD arrays, 12 V TVS, motor TVS/RC/Schottky at J3–J6, ferrites/CMC, cable shields. Do not leave DNP footprints for them.

If IEC ESD is ever required, one clamp **at the ESP32 harness**, not on every module. Revisit if the cable leaves the enclosure, PWM speed is added, or Wi-Fi drops during pours.

Keep F1, C1 (100 nF at U1 VDD), and the 10 kΩ pulldowns / PWM straps — those are safe-off / PDN, not ESD. Carrier local caps cover VM.

## Safe defaults (ERC review checklist)

- [ ] 10 kΩ pull-down on each IN1/IN2 (8 resistors). MCP23017 POR = pins as inputs, internal pull-ups off, OLAT=0.
- [ ] PWM strapped to VLOGIC through **10 kΩ** (R10–R13, both TB6612, both channels).
- [ ] STBY follows `PUMP_BUS_ENABLE` with 10 kΩ PD; low = drivers off.
- [ ] MCP23017 /RESET tied to ESP32 EN (or GPIO held low in reset) with pull-up; do not float.
- [ ] TB6612 VCC = 3.3 V (same as expander / ESP32). Do not run TB6612 logic at 5 V with 3.3 V I2C.
- [ ] I2C pull-ups **one set on the controller** (2.2–4.7 kΩ to 3.3 V), not per module.
- [ ] No pump power on J1 unless system cutoff closed.
- [ ] Motor supply and logic GND connected at a documented single-point strategy.
- [ ] Test pads: 12V, GND, SDA, SCL, `PUMP_BUS_ENABLE`, each motor output.
- [ ] Firmware init: expander outputs off, then `PUMP_BUS_ENABLE` high. Do not enable MCP23017 internal pull-ups on IN1/IN2.

If substituting **TCA9539**: write output registers to `0x00` **before** setting pins as outputs (TI POR high). Not a drop-in footprint.

## PCB layout notes

- Wide pours for 12 V and GND between drivers and connectors. Use the **Power** netclass (1.0 mm track) for 12 V / VM.
- Keep MCP23017 and I2C away from motor switching paths.
- **C1** 100 nF at U1 VDD/VSS (pins 9/10). Module VM bulk waits on a look at the clone. Genuine SparkFun has 10 µF on VM; this board might not.
- Socket pitch stays **15.25 mm**. That is the measured clone row spacing. Outline keepout is **21 × 18 mm** (21 along the pins). Do not move the sockets to 12.7 mm.
- Silkscreen the socket values off `Pololu*` onto `U2-CTRL`, `U2-PWR`, `U3-CTRL`, `U3-PWR`, and mark the square-pad end **VM / PWMA**.
- Mounting holes match cartridge CAD in [`docs/08-mechanical-design.md`](../../docs/08-mechanical-design.md) when available.
- Silkscreen: pump numbers, module address (0x20–0x23), **wet side / logic side** labels.

## BOM placeholders

| Ref | Part | Value |
| --- | ---- | ----- |
| U1 | MCP23017-E/SO | I2C GPIO expander (backup: TCA9539PWR) |
| U2, U3 | AliExpress TB6612 clone, item `3256807799494692` | SparkFun V11 pin order. Rows **15.25 mm**. Body **21 × 18 mm**. |
| F1 | Polyfuse or fuse | TBD after stall current test |
| C1 | 100 nF 0805 X7R ≥16 V | At U1 VDD (pins 9/10). No module VM bulk. |
| J1 | Molex 43045-0600 | Bus IN (2×3 right-angle TH). No J2. |
| J3–J6 | JST B2B-XH-A(LF)(SN) | 2-pin motor, LCSC C158012 |
| J7–J10 | PinSocket 1×8, 2.54 mm | Clone sockets, rows **15.25 mm** (measured). Pin 1 = VM/PWMA end |
| — | XH 2-pin female pigtails | 10 pcs (8 pumps + 2 spare); splice to motor leads |
| — | 10 kΩ | IN1/IN2 PDs, STBY PD, PWM straps R10–R13, /RESET, A0/A1 |

## Pre-fab sign-off

1. Bench stall current recorded → fuse and trace width validated.
2. Connector pinout matches harness doc.
3. `hardware/kicad/scripts/check.sh` ERC clean; `check.sh --drc` DRC clean.
4. Paper print of board outline vs cartridge template.
5. Review with [`docs/05-electronics-and-pcb.md`](../../docs/05-electronics-and-pcb.md) pre-fabrication checklist.
6. Test 10.4: schematic safe-off review (IN1/IN2 PDs, STBY PD, PWM strap, MCP23017 /RESET). I2C hardware (10.1–10.3) is first-article, not a Gerber gate.
