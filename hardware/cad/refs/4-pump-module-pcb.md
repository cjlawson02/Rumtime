# 4-pump module PCB envelope

**Source:** ordered [`4-pump-module.kicad_pcb`](../../kicad/4-pump-module/4-pump-module.kicad_pcb) (`Edge.Cuts` + footprint origins), read 2026-11-01. Not a STEP export.

## Coordinate system

- Units: **millimeters**
- Origin: top-left corner of `Edge.Cuts` (KiCad page **94.75, 48.85**)
- **X** right, **Y** down (KiCad convention)

## Outline

| Item | Value |
| --- | ---: |
| Edge.Cuts | **84.70 × 20.85 mm** strip |
| Thickness | **1.6 mm** |
| Mounting holes | **none** — the four-pump-block shell retains the board |

## Connectors (footprint origins)

| Ref | Part | X | Y |
| --- | --- | ---: | ---: |
| J1 | Micro-Fit 2×3 **horizontal** (`43045-0600`), pump bus in | 4.1 | 9.5 |
| J3 / J4 / J5 / J6 | JST-XH 2-pin, pump motors 1–4 | 9.0, 39.6, 50.4, 80.8 | 16.7, 16.7, 16.7, 17.7 |
| J7 / J8, J9 / J10 | 1×8 sockets, two TB6612 carriers (15.25 mm rows) | 16.7, 58.0 | 3.4 / 18.6, 3.5 / 18.7 |
| U1 | SOIC-28W I/O expander | 46.3 | 7.6 |

## J1 (Micro-Fit horizontal) — mating geometry

From KiCad stock footprint
`Molex_Micro-Fit_3.0_43045-0600_2x03_P3.00mm_Horizontal` (rotation **0** on the
ordered board):

- Footprint origin is the connector reference (pad **1** at local **(0, 0)**).
- Pin field spans local **X = 0…6 mm**, **Y = 0…3 mm** (2×3, 3 mm pitch).
- Plastic shroud / courtyard extend in **−Y** from the pin row (fab to about
  **Y = −8.92 mm**; courtyard to **Y = −9.42 mm**). A short tail extends to
  **Y = +4.25 mm** toward the board interior.
- **Mating direction** (plug travel): **−Y** in footprint coordinates — the
  plug approaches from off the **top** edge of the board outline (KiCad **−Y**,
  toward smaller board **Y**).

| Item | Size (mm) |
| --- | ---: |
| Courtyard (local X × Y) | **14.16 × 13.67** (−4.08…10.08 × −9.42…4.25) |
| Fab body (local X × Y) | **13.15 × 9.91** |

## Enclosure use

- Mapped into the four-pump block with the board **flat on 3 mm standoffs** above the cavity floor,
  long axis along block **X**, KiCad **+X → +X**, KiCad **+Y → −Y** (front), so
  J1 mates toward block **+Y** (rear wall / cartridge blind-mate).
- J1 footprint origin on the board: **(4.1, 9.5)** mm from the top-left
  `Edge.Cuts` corner; the mating face sits on the board’s **top** outline edge
  (KiCad min **Y**), offset **~9.5 mm** from the left outline corner along
  **X**.
- Socketed TB6612 carrier height in CAD: **12 mm** above the PCB surface until
  measured on the bench.
- J1 mating-face height above the board (**3.0 mm** above PCB mid-plane in CAD) is from the footprint, not measured; check before printing the dock.
