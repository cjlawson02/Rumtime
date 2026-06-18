# 4-Pump Module — Altium Schematic Spec

Pre-layout specification for the Phase 2 **4-pump module** PCB. Implement as hierarchical sheets in Altium.

Architecture reference: [`docs/05-electronics-and-pcb.md`](../../docs/05-electronics-and-pcb.md).

## Block diagram

```text
J1 LOGIC (from main controller)
  GND, VLOGIC (3.3 V or 5 V — match PCA9685 / ESP32 I2C levels)
  SDA, SCL
  optional PUMP_BUS_ENABLE

J2 POWER (12 V pump bus, after system cutoff)
  12V, GND

  → F1 polyfuse or fuse
  → C_bulk (100–470 µF electrolytic + 100 nF ceramic near drivers)
  → U1 PCA9685 (+ I2C addr jumpers ADDR0/ADDR1)
  → U2 TB6612FNG → J3 PUMP1, J4 PUMP2
  → U3 TB6612FNG → J5 PUMP3, J6 PUMP4
```

## Schematic sheets (recommended)

| Sheet | Contents |
| ----- | -------- |
| `Power_In` | J2, fuse, bulk cap, optional TVS |
| `Logic_In` | J1, I2C ESD optional, addr jumpers to PCA9685 |
| `PWM_Expander` | U1 PCA9685, decoupling, ADDR straps |
| `Drivers_A` | U2 TB6612, pump 1–2 connectors |
| `Drivers_B` | U3 TB6612, pump 3–4 connectors |
| `Mounting` | Holes, keep-out notes (non-electrical) |

## PCA9685 → TB6612 signal map

Document on schematic; example starting point:

| PCA9685 ch | Net name | Destination |
| ---------: | -------- | ----------- |
| 0 | P1_IN1 | U2 AIN1 |
| 1 | P1_IN2 | U2 AIN2 |
| 2 | P1_PWM | U2 PWMA |
| 3 | P2_IN1 | U2 BIN1 |
| 4 | P2_IN2 | U2 BIN2 |
| 5 | P2_PWM | U2 PWMB |
| 6 | P3_IN1 | U3 AIN1 |
| 7 | P3_IN2 | U3 AIN2 |
| 8 | P3_PWM | U3 PWMA |
| 9 | P4_IN1 | U3 BIN1 |
| 10 | P4_IN2 | U3 BIN2 |
| 11 | P4_PWM | U3 PWMB |
| 12–15 | LED/spare | Optional status |

Shared **STBY** nets: tie TB6612 STBY high via pull-up; optionally control from PCA9685 spare channel or logic connector.

## I2C address

| ADDR1 | ADDR0 | 7-bit address |
| ----- | ----- | ------------- |
| 0 | 0 | 0x40 |
| 0 | 1 | 0x41 |
| 1 | 0 | 0x42 |
| 1 | 1 | 0x43 |

Use 2-pin jumpers or solder bridges labeled on silkscreen. Up to three modules on one bus for 12 pumps.

## Connectors (v1 targets)

| Ref | Type | Notes |
| --- | ---- | ----- |
| J1 | JST-GH 6-pin or 1×6 header | Logic — keyed |
| J2 | XT30 or 2-pin 5.08 mm terminal | 12 V pump power |
| J3–J6 | JST-VH 2-pin or screw terminal | Motor outputs, silkscreen P1–P4 |

## Safe defaults (ERC review checklist)

- [ ] All pump outputs off when PCA9685 / MCU in reset (IN1=IN2=LOW).
- [ ] STBY default enables driver only when intended (document state).
- [ ] No pump power on J2 unless system cutoff closed.
- [ ] I2C pull-ups on main controller side (or module if bus requires — one set per bus).
- [ ] Motor supply and logic GND connected at single point strategy documented.
- [ ] Test pads: 12V, GND, SDA, SCL, each motor output.

## PCB layout notes

- Wide pours for 12 V and GND between drivers and connectors.
- Keep PCA9685 and I2C away from motor switching paths.
- Bulk cap at each TB6612 VM pin.
- Mounting holes match cartridge CAD in [`docs/08-mechanical-design.md`](../../docs/08-mechanical-design.md) when available.
- Silkscreen: pump numbers, module address, **wet side / logic side** labels.

## BOM placeholders (lock after Phase 0 measurements)

| Ref | Part | Value |
| --- | ---- | ----- |
| U1 | PCA9685PW | I2C PWM |
| U2, U3 | TB6612FNG | Dual H-bridge |
| F1 | Polyfuse or fuse | TBD after stall current test |
| C_bulk | Electrolytic | TBD per Altium power integrity |
| J2 | XT30 pair | 12 V in |

## Pre-fab sign-off

1. Bench stall current recorded → fuse and trace width validated.
2. Connector pinout matches harness doc.
3. ERC clean; DRC clean.
4. Paper print of board outline vs cartridge template.
5. Review with [`docs/05-electronics-and-pcb.md`](../../docs/05-electronics-and-pcb.md) pre-fabrication checklist.
