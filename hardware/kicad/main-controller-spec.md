# Main Controller (Motherboard) — KiCad Schematic Spec

Pre-layout specification for the **main controller** PCB. Implement as hierarchical sheets in KiCad (`main-controller/main-controller.kicad_sch`).

**Status (2026-09-12):** Schematic **v2** — four Micro-Fit 2×3 pump-bus OUTs (no daisy), Mini560 5 V ×2, fused screw-terminal inlet, HX711 1×6+1×4, DevKit **25.4 mm**. Run `scripts/check.sh main-controller`. PCB layout **not started**. Same toolchain as the 4-pump module ([`README.md`](README.md)). Load cell / HX711 lives **here**, not on the pump modules.

Architecture: [`docs/05-electronics-and-pcb.md`](../../docs/05-electronics-and-pcb.md), [`docs/02-system-architecture.md`](../../docs/02-system-architecture.md). Pump-bus pinout must stay pin-for-pin with [`4-pump-module-spec.md`](4-pump-module-spec.md) J1.

The MCU is a **socketed ESP32-S3-DevKitC-1** (same family as the bench). Do **not** design a custom ESP32 module for v1.

## Locked choices

| Topic | Decision |
| ----- | -------- |
| MCU | ESP32-S3-DevKitC-1 (N8R8 or N16R8) in **two 1×22** 2.54 mm sockets, **25.4 mm** row C-C |
| Kiosk ↔ ESP32 | **Wi-Fi HTTP** (JSON). Not USB serial. See [`docs/17-kiosk-ui-plan.md`](../../docs/17-kiosk-ui-plan.md). |
| Kindle USB-C | **Charge only.** No D+/D− to the ESP32. |
| ESP32 programming / Wi-Fi serial provision | DevKit **native USB-C** (CDC). Keep that connector at the board edge. |
| Pump bus | **Four** Molex Micro-Fit 3.0 **2×3** vertical TH (`43045-0612`), pin-for-pin paralleled (one home-run per module). **No module J2.** |
| Main power | **Single** switch on switched 12 V. Fuse is the **off-board inline ATC** already bought — no second fuse on the PCB. |
| HX711 | Socket the kit module (**1×6 analog + 1×4 digital**); 4-pin JST to the load-cell bar |
| I2C pull-ups | **Once on this board** (2.2 kΩ to 3.3 V). Not on modules. |

Enclosure mounting holes and whether SW1 is board-edge vs a panel pigtail wait on CAD — both can exist as footprints. DevKit and HX711 row spacing are **measured** (below).

## Block diagram

```text
12 V PSU pigtail  →  off-board inline fuse  →  J1 screw terminal
  → SW1 main power  (DC-rated ≥10 A)
  → +12V_SW
        ├─ LED_PWR (hardware, not GPIO)
        ├─ J_BUS1–4 Micro-Fit 2×3  pin 1 (+12V_SW)
        ├─ U_BUCK_ESP  Mini560 5V  12 V → 5 V
        │     → D1 Schottky → DevKit 5V pin
        │     DevKit 3V3 → I2C pull-ups, HX711 VCC, J_BUS pin 4
        └─ U_BUCK_USB  Mini560 5V  12 V → 5 V
              → USB-C VBUS (Kindle)
              CC1/CC2 Rp 10 kΩ to 5V_USB  (advertise 3 A @ 5 V)

ESP32-S3-DevKitC-1
  GPIO 8/9   → HX711 DT/SCK
  GPIO 11/12 → I2C SDA/SCL → J_BUS1–4 pins 5/6
  GPIO 17    → PUMP_BUS_ENABLE (10 kΩ PD) → J_BUS1–4 pin 3
  GPIO 10    → LED_STATUS
  USB-C      → host PC (flash + serial provision)  — not the Kindle jack

J9  1×6 analog  ↔ kit HX711 (E+ E− A− A+ B− B+)
J12 1×4 digital ↔ kit HX711 (GND DT SCK VCC)
J_CELL   JST-XH 4-pin  ↔ Estardyn bar (E+/E−/A+/A−)
```

## Kiosk USB vs serial (do not reopen)

Kindle Fire talks to the ESP32 over **home-LAN HTTP**, discovered as `rumtime.local`. USB-serial and BLE are **not** kiosk paths.

Serial on this board is only:

1. **DevKit USB-C** — firmware flash and `wifi` credential provision until soft-AP exists.
2. Optional **UART0 test pads** (GPIO 43/44) if the DevKit USB is boxed in.

The Kindle USB-C jack does **not** carry serial, ADB, or ESP32 USB. Connecting those would fight the locked kiosk transport and back-feed a tablet port that is not a USB host for our CDC ACM.

USB-C charging is **5 V / 3 A advertised via CC Rp**, not a USB-PD protocol PHY. 15 W at 5 V covers Fire HD 8/10 class tablets. If a specific Fire refuses to charge without 9 V PD, socket a 12 V → USB-C PD source module on `U_BUCK_USB` later — do not add a PD stack in v1.

## KiCad references (schematic v2)

Single A3 sheet. Net labels carry the spec names:

| Ref | Spec | Function |
| --- | ---- | -------- |
| J1 | J_DC | 2-pin 5.08 mm screw terminal — **already-fused** 12 V |
| J3 | U_BUCK_ESP | Mini560 **5 V** castellated, ESP32 rail |
| J4 | U_BUCK_USB | Mini560 **5 V** castellated, Kindle VBUS |
| J5 / J6 | DevKit | 1×22 left / right, **25.4 mm** row C-C |
| J7 / J8 / J13 / J14 | J_BUS1–4 | Micro-Fit 2×3, paralleled |
| J9 | J_HX711_A | Female **1×6** analog, left |
| J10 | J_CELL | JST-XH 4-pin |
| J11 | J_USB | USB-C charge-only 6P |
| J12 | J_HX711_D | Female **1×4** digital, right |
| SW1 | main power | Panel SPST landing (10 A DC) |
| D1 | Schottky | 5V_ESP → DevKit 5V |
| D2 / D3 | LED_PWR / LED_STATUS | |
| R2 / R3 | I2C 2.2 kΩ | |
| R4 | ENABLE 10 kΩ PD | |
| R5 / R6 | CC Rp 10 kΩ | |

**Removed vs v1:** barrel jack (old J1), GST120-alt paralleled with it (old J2), onboard mini-blade **F1**. The Phase 0 inline ATC holder is the fuse. That old schematic J2 is **not** a pump-module daisy — modules have **no J2**.

## Schematic sheets (recommended)

| Sheet | Contents |
| ----- | -------- |
| `Power_In` | J1 fused screw terminal, SW1, `+12V_SW`, LED_PWR |
| `Bucks` | Two Mini560 5 V (J3 ESP, J4 Kindle), D1 Schottky, 5 V pours |
| `DevKit` | Two 1×22 sockets at 25.4 mm C-C, 5 V in, 3V3 out, USB keep-out |
| `Pump_Bus` | J_BUS1–4 Micro-Fit (paralleled), I2C pull-ups, ENABLE PD |
| `Scale` | J9 1×6 + J12 1×4, J_CELL XH-4, DT/SCK |
| `Usb_C_Kiosk` | USB-C receptacle, CC Rp, VBUS from 5V_USB, D+/D− NC |
| `Front_Panel` | LED_STATUS only (no start/cancel buttons) |
| `Mounting` | Holes, keep-outs (non-electrical) |

## Power

### Inlet

Fuse lives **off the board** — Phase 0 mini-BOM inline ATC holder + 5 A (GST60) / 10 A (GST120). Do not add a second holder (old F1).

```text
PSU pigtail  →  inline fuse  →  J1 screw terminal  →  SW1  →  +12V_SW
```

| Ref | Type | Notes |
| --- | ---- | ----- |
| J1 | 2-pin **5.08 mm** screw terminal | Stripped GST60 **or** GST120 pigtail after the inline fuse. Pin 1 = fused 12 V (+), pin 2 = GND. |
| SW1 | 2-pin 5.08 mm landing | Panel rocker/toggle, **≥10 A DC** at 12 V. A 10 A *AC* wall switch is not equivalent. |

Silkscreen: `12V FUSED ⊕`. No reverse-polarity FET in v1 — marked terminal + off-board fuse.

GST120 is DIN-4 **R7B**, not a barrel. One screw terminal covers both bricks; the old barrel (v1 J1) and paralleled GST120 jack (v1 J2) are gone.

### Cutoff

- **SW1** is the **only** power switch. It kills pumps, ESP32, and Kindle charge together. The inline fuse is protection, not a cutoff.
- Keep SW1 even though the fuse is already in the pigtail.

### Two 5 V rails (do not share)

| Rail | Source | Load | Why separate |
| ---- | ------ | ---- | ------------ |
| `5V_ESP` | J3 Mini560 5 V | DevKit 5V via D1 | Wi-Fi peaks. Kindle inrush must not brown out the MCU. |
| `5V_USB` | J4 Mini560 5 V | Kindle VBUS only | Charge current. |

**Buy two Mini560 5 V modules. Do not share the output.** The sheet’s “< 5 A” is a peak; cooling is required above 4 A continuous. USB-C advertises 3 A for the Kindle alone. One module can look like enough on paper and still reset the ESP32 when a flat tablet hits VBUS. DevKit programming USB-C and Kindle VBUS also back-feed each other if they sit on the same 5 V.

Not the Mini560 **Pro** (33 mm, 32 V in). This landing is the 29 × 18 mm / 20 V-max sheet.

### Mini560 5 V landing (J3 / J4)

Solder the castellations to `Rumtime:Mini560` (local pretty). Do not lay out a switcher. Leave **EN** open (on). Leave the LED jumper open.

| Item | Value |
| ---- | ----- |
| Version | **5 V** only (7–20 V in). 12 V PSU is in range. Not 3.3 / 9 / 12 V. |
| Body | **29 × 18 × 5.4 mm** |
| Pad columns | **26 mm** C-C (input ↔ output). Overall with pad overhang **30 mm**. |
| Each end | Two **IN+** (or OUT+) at **2.54 mm**, two **IN−** (or OUT−) at **2.54 mm**, inner +/− **8.92 mm** |
| Schematic pins | 1 = IN+, 2 = IN−, 3 = OUT+, 4 = OUT− (paralleled pads share the number) |

**D1:** Schottky (e.g. 1N5819 / SS14) from `5V_ESP` to DevKit `5V`. Blocks USB-host back-feed into the buck when the DevKit USB-C is plugged in for flash. Silkscreen: programming USB is fine; Kindle jack is the other connector.

### 3.3 V

Feed the DevKit **5V pin only**. Take **3V3 from the DevKit** to:

- Micro-Fit pin 5 (module logic + TB6612 VCC)
- HX711 VCC
- I2C pull-ups
- Status LED if 3.3 V (or drive from GPIO with resistor)

Module 3.3 V budget is tens of mA (4× MCP23017 + 8× TB6612 VCC). Do **not** inject an external 3.3 V regulator into the DevKit 3V3 pin.

GND is common (pump + logic) at this board.

## DevKit socket (2×22)

Not a single 2×22 connector — Espressif **two 1×22** headers, 2.54 mm pitch.

| Item | Value |
| ---- | ----- |
| Footprints | `Connector_PinSocket:PinSocket_1x22_P2.54mm_Vertical` ×2 |
| Pin | **0.64 mm** square (measured) |
| Row spacing | **25.4 mm (1.0")** center-to-center. Measured **26.0 mm outer / 24.8 mm inner** on the bench N16R8 DevKit — **not** Espressif’s 22.86 mm (0.9") typical. |
| USB-C | Hang the DevKit USB-C **off the PCB edge** so a cable still fits |
| Strapping | Do not attach nets to GPIO **0, 45, 46** except the existing DevKit buttons/LEDs |

### GPIO map (product)

Bench pump GPIOs (4–7, 15–16) are **unused** on this board — motors moved to I2C modules. Keep HX711 and STBY pins that are already proven.

| Function | GPIO | Header | Notes |
| -------- | ---- | ------ | ----- |
| HX711 DT | **8** | left | Keep from bench |
| HX711 SCK | **9** | left | Keep from bench |
| I2C SDA | **11** | left | `Wire.begin(11, 12)` — **not** 8/9 |
| I2C SCL | **12** | left | |
| PUMP_BUS_ENABLE | **17** | left | Same as bench STBY |
| LED_STATUS | **10** | left | Active high |
| UART0 TX/RX | 43/44 | right | Test pads only |
| USB D−/D+ | 19/20 | left | DevKit native USB — **do not reuse** |

Avoid GPIO 0, 45, 46. Do not put I2C on 8/9 — that is the calibrated HX711 pair.

## Pump bus (four Micro-Fit 2×3)

**J_BUS1–J_BUS4** — same connector and pin map as module J1, **all six nets paralleled**. This is a four-drop star at the controller, not four I2C buses.

Each box is **one home-run**. Modules have **no J2**. v1 can land 4 cartridges (16 pumps) without a daisy or a controller respin.

```text
Motherboard J_BUS1 ──► Module A J1     (pumps 1–4)
Motherboard J_BUS2 ──► Module B J1     (pumps 5–8)
Motherboard J_BUS3 ──► Module C J1     (pumps 9–12)
Motherboard J_BUS4 ──► Module D J1     (pumps 13–16)
```

**Do not close a ring.** Do not jumper module-to-module. Unused jacks stay unplugged.

| Pin | Net | Notes |
| --- | --- | --- |
| 1 | +12V_SW | One pin per jack; all four share the pour |
| 2 | GND | Next to +12V |
| 3 | PUMP_BUS_ENABLE | GPIO 17, 10 kΩ PD to GND |
| 4 | 3V3 | From DevKit |
| 5 | SDA | GPIO 11 |
| 6 | SCL | GPIO 12 |

| | |
| --- | --- |
| Symbol | Match module J1 (`Conn_02x03_Counter_Clockwise`; harness uses Molex pad numbers) |
| Footprint | `Connector_Molex:Molex_Micro-Fit_3.0_43045-0612_2x03_P3.00mm_Vertical` |
| MPN | Molex **43045-0612** (`0430450612`) ×4 (mate **43025-0600**) |

MCP23017 **/RESET** stays on each module (local pull-up). It is **not** on this cable.

I2C: **R_SDA, R_SCL = 2.2 kΩ** to 3.3 V (one pair on this board, for all four jacks). 4.7 kΩ only if a single short module misbehaves at 2.2 kΩ.

## HX711 (1×6 + 1×4) and load-cell JST

The kit module is **~34 × 20 mm**, analog pads on one edge, digital on the other — not a DIP. Motherboard sockets are **female PinSocket**, so the module pins plug in.

Measured (this kit): **20.8 mm outer / 19.8 mm inner**, **0.64 mm** pin width → lock **20.3 mm** pin-center row spacing.

### J9 — female 1×6 analog (left)

Silkscreen typical of the red/green kit; confirm pin 1 on the physical module before layout.

| Pin | Net |
| --: | --- |
| 1 | E+ |
| 2 | E− |
| 3 | A− |
| 4 | A+ |
| 5 | B− (NC) |
| 6 | B+ (NC) |

### J12 — female 1×4 digital (right)

| Pin | Net |
| --: | --- |
| 1 | GND |
| 2 | DT (GPIO 8) |
| 3 | SCK (GPIO 9) |
| 4 | VCC = 3.3 V |

Leave B+/B− unconnected on the cell. RATE jumper stays on the module.

| | Analog | Digital |
| --- | --- | --- |
| Symbol | `Connector:Conn_01x06` | `Connector:Conn_01x04` |
| Footprint | `PinSocket_1x06_P2.54mm_Vertical` | `PinSocket_1x04_P2.54mm_Vertical` |
| Row C-C | **20.3 mm** (from 20.8 / 19.8 / 0.64) | same |

### J_CELL — JST-XH 4-pin

Detachable load-cell cable. PCB ties these to J9 analog pins.

| Pin | Net | Bar wire |
| --- | --- | -------- |
| 1 | E+ | **Red** |
| 2 | E− | **Black** |
| 3 | A+ | **Green** |
| 4 | A− | **White** |

| | |
| --- | --- |
| Symbol | `Connector:Conn_01x04_Pin` |
| Footprint | `Connector_JST:JST_XH_B2B-XH-A_1x04_P2.50mm_Vertical` |
| MPN | `B4B-XH-A(LF)(SN)` |

Same XH family as the pump motors (no extra crimp tool). If the bar stays soldered to the HX711 (current bench), leave J_CELL unpopulated.

**Analog run:** mV signals. Keep the JST cable short, twisted, and away from the 12 V / Micro-Fit bundle. Preferred mechanically: HX711 on the dry/fixed side of the cantilever with a short digital jumper to J9/J12. Do not route the cell across the wet compartment.

## Kindle USB-C (charge only)

| | |
| --- | --- |
| Footprint | USB-C **receptacle**, USB 2.0 16-pin mid-mount (KiCad `USB_C_Receptacle_USB2.0_16P` class) |
| VBUS | `5V_USB` only |
| GND / shield | GND |
| CC1, CC2 | **10 kΩ** each to `5V_USB` (source Rp, 3 A @ 5 V) |
| D+, D−, SBU, VCONN | **NC** |

No PD controller. No connection to DevKit USB.

## Front panel

| Ref | Function | Wiring |
| --- | -------- | ------ |
| LED_PWR | Power (machine is on) | `+12V_SW` → resistor → LED → GND. **Not** a GPIO. |
| LED_STATUS | Ready / pouring / error (firmware) | GPIO 10 → resistor → LED → GND. Different color from LED_PWR. |
| SW1 | **Main power cutoff** | 2-pin landing for a panel rocker/toggle, ≥10 A DC. Opens `+12V_SW`. Required even with the inline fuse. |

No start/cancel tactiles. The kiosk is Make it / Cancel. Firmware already aborts on HTTP `/pour/cancel`, serial `cancel`, STA drop, and kiosk heartbeat timeout. SW1 is the physical panic. GPIO 13/14 stay unused.

A display is still deferred (Kindle is the UI).

## Test pads

`+12V_SW`, `5V_ESP`, `5V_USB`, `3V3`, `GND`, `SDA`, `SCL`, `PUMP_BUS_ENABLE`, `HX711_DT`, `HX711_SCK`.

## What this board is not

- Not a second pump-bus MOSFET / software cutoff.
- Not I2C ESD, 12 V TVS, or ferrites (same v1 rule as the module; USB-C is a user port — ESD DNP only if a later spin needs it).
- Not two independent I2C buses (four paralleled 2×3 OUTs).
- Not onboard ESP32-S3 (socket the DevKit).
- Not USB-serial between Kindle and ESP32.
- Not start/cancel tactiles (kiosk + SW1).

## PCB layout notes

- Edge cluster: J1 screw terminal, SW1, Kindle USB-C, DevKit USB-C keep-out, Micro-Fit.
- Wide pour for `+12V_SW` / GND to Micro-Fit (Power netclass 1.0 mm, same as the module).
- Keep HX711 analog away from buck inductors and the 12 V pour.
- Paper-fit HX711 1×6 / 1×4 at **20.3 mm** C-C; DevKit 1×22 at **25.4 mm** C-C.
- Mounting holes TBD vs enclosure; 4× M3 in a rectangle is enough until CAD exists.
- Silkscreen: `12V FUSED ⊕`, Micro-Fit pin 1, HX711 pin 1 (analog and digital), cell wire colors, `KINDLE CHARGE`, `ESP32 USB`.

## BOM placeholders

| Ref | Part | Value |
| --- | ---- | ----- |
| J1 | 5.08 mm 2-pin screw terminal | Fused 12 V pigtail |
| SW1 | Rocker/toggle **DC ≥10 A** | Panel or edge |
| U_BUCK_ESP | Mini560 **5 V** | J3; solder castellated |
| U_BUCK_USB | Mini560 **5 V** | J4; Kindle VBUS; second module |
| D1 | Schottky ≥1 A | 5V_ESP → DevKit 5V |
| — | PinSocket 1×22 ×2 | DevKit, **25.4 mm** rows |
| J_BUS1–4 | Molex 43045-0612 | Pump bus OUT ×4, vertical 2×3 |
| J9 | PinSocket 1×6 | HX711 analog, 20.3 mm vs J12 |
| J12 | PinSocket 1×4 | HX711 digital |
| J_CELL | JST B4B-XH-A | Load-cell bar |
| J_USB | USB-C receptacle 16P | Charge only |
| R_CC1/2 | 10 kΩ | CC Rp to 5V_USB |
| R_SDA/SCL | 2.2 kΩ | I2C pull-ups |
| R_EN | 10 kΩ | ENABLE PD |
| LED_PWR, LED_STATUS | 3 mm or 0805 | Two colors |

## Safe defaults (ERC review checklist)

- [ ] SW1 removes `+12V_SW` from all four Micro-Fits, both bucks, and LED_PWR.
- [ ] J_BUS1–4 are pin-for-pin the same nets (no isolated second bus).
- [ ] `PUMP_BUS_ENABLE` 10 kΩ PD; low at reset = drivers off.
- [ ] I2C pull-ups **only** on this board.
- [ ] HX711 VCC = 3.3 V, not 5 V.
- [ ] Kindle D+/D− NC; CC Rp 10 kΩ to `5V_USB`.
- [ ] DevKit powered from `5V_ESP` through D1; 3V3 taken **from** the DevKit.
- [ ] GPIO 8/9 = HX711; GPIO 11/12 = I2C; GPIO 0/45/46 unused.
- [ ] Micro-Fit pin map identical to module J1.
- [ ] Firmware: expander outputs off, then ENABLE high (same as module spec).

## Pre-fab sign-off

1. DevKit header row spacing **locked 25.4 mm** (measured 26.0 / 24.8 / 0.64).
2. HX711 pad rows **locked 1×6 + 1×4** at **20.3 mm** C-C (measured 20.8 / 19.8 / 0.64). Confirm silkscreen pin 1.
3. Connector pinouts vs this spec and [`4-pump-module-spec.md`](4-pump-module-spec.md).
4. `hardware/kicad/scripts/check.sh` ERC; `check.sh --drc` after Edge.Cuts.
5. Paper print vs enclosure / DevKit USB clearance.
6. Confirm SW1 is DC-rated. Inline fuse stays off-board (do not add F1).

## Firmware follow-up (not this PCB)

Product firmware still talks to two local TB6612 GPIOs. When this board is the target:

- Move pump I/O to MCP23017 (`PumpModule` HAL — already on the docs/16 punch list).
- `Wire.begin(11, 12)`.
- Drive LED_STATUS. Cancel is HTTP/serial/Wi-Fi, not a GPIO.
- Keep `kScaleDout = 8`, `kScaleSck = 9`.
