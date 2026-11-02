# Main controller PCB envelope

**Source:** ordered [`main-controller.kicad_pcb`](../../kicad/main-controller/main-controller.kicad_pcb) (`Edge.Cuts` + footprint origins), read 2026-11-01. Not a STEP export. Re-read if the board is respun.

## Coordinate system

- Units: **millimeters**
- Origin: top-left corner of `Edge.Cuts` (KiCad page **104.95, 54.10**)
- **X** right, **Y** down (KiCad convention), top copper facing the viewer

## Outline

| Item | Value |
| --- | ---: |
| Edge.Cuts | **76.70 × 51.10 mm** rectangle |
| Thickness | **1.6 mm** |

## Mounting holes (M3, Ø3.2 mm)

The four holes are **not** a rectangle. The lower pair sits **1.7 mm** right of the upper pair. Copy coordinates; do not symmetrize.

| Ref | X | Y | Footprint |
| --- | ---: | ---: | --- |
| H1 | 18.25 | 4.92 | `MountingHole_3.2mm_M3` |
| H2 | 59.36 | 4.92 | `MountingHole_3.2mm_M3` |
| H3 | 16.54 | 45.57 | `MountingHole_3.2mm_M3_Pad` |
| H4 | 57.64 | 45.57 | `MountingHole_3.2mm_M3_Pad` |

Spans: **41.1 mm** in X within each pair, **40.65 mm** in Y between pairs.

## Connector edges (footprint origins)

| Edge | Parts | X positions |
| --- | --- | --- |
| Top (Y ≈ 3) | J7 / J8 / J13 / J14 Micro-Fit 2×3 vertical, pump-bus home-runs | 5.0, 25.5, 46.1, 66.6 |
| Bottom (Y ≈ 45–48) | J11 USB-C (Kindle charge), J1 fused 12 V screw terminal, SW1 landing, J10 load-cell XH-4 | 6.2, 24.5, 45.3, 64.9 |
| Interior | DevKit sockets J5 / J6 (X 56.0, Y 12.4 / 37.8, rotated −90°), HX711 J9 / J12, Mini560 J3 / J4 | — |

## Enclosure use

- Bottom edge faces the **electronics-box rear panel** (12 V in, SW1, USB-C, load-cell lead).
- Top edge (Micro-Fits) faces into the box so the four home-runs can rise up the side cable channels.
- Verify DevKit USB-C direction and the stack height (sockets + DevKit + mated Micro-Fit plugs) on the assembled board before fixing the 50 mm box height.
