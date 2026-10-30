# Back-to-back 2+2 tube bundle clamp

Small FDM clip that holds four **3×5 mm** silicone lines: **two clamps on
one face, two on the opposite face**, with a solid spine between them. No
foot / base plate — the part rides on the tubes.

**Status:** Fit-test starting values. Snap cavity/throat match the
four-pump-block top-panel clamps ([`four-pump-block.md`](four-pump-block.md));
silicone press still **pending** there.

## Coordinate system

- Units: **millimeters**
- **X** = across the two clamps on a face
- **Y** = along the tube axis (canal length)
- **Z** = through the spine (top face ↔ bottom face)
- Origin: center of the shared spine

## Overall envelope

| Axis | Size | Role |
| --- | ---: | --- |
| X | **15 mm** | Across the two clamps |
| Y | **5 mm** | Short tube canal |
| Z | **15 mm** | Back-to-back depth |

## Layout (side view, looking along +Y)

```text
        throat ↑
         C1  C2          ← top face (6.75 mm)
        ════════         ← spine (1.5 mm WEB)
         C3  C4          ← bottom face (6.75 mm)
        throat ↓
```

Tubes pass through the **5 mm** Y span (short grip, not a long run guide).

## Equal web

One thickness **WEB = 1.5 mm** (= clamp outer wall) is used for:

| Location | How |
| --- | --- |
| Outer wall around each cavity | `CLAMP_WALL_T` |
| Solid between the two holes on a face | `pitch − cavity_d = WEB` |
| Solid between back-to-back faces | spine slab = **WEB** |

Face pitch = **5.15 + 1.5 = 6.65 mm**. Each face block is **6.75 mm** tall
(`(15 − 1.5) / 2`). Tube circles are **centered** in each face block so the
solid wall to the outer face and to the spine is equal (**0.8 mm** each with
current dims).

| Slot | Center X | Notes |
| --- | ---: | --- |
| C1 / C3 | **−3.325** | Left column |
| C2 / C4 | **+3.325** | Right column |

Top-face circle axis Z = **+4.125 mm**; bottom = **−4.125 mm**.

## Clamp geometry (from four-pump-block)

| Parameter | Value | Notes |
| --- | ---: | --- |
| Line tubing | **3×5 mm** (5 mm OD) | On hand |
| Layout | **2 + 2 back-to-back** | Opposite faces + spine |
| Overall size | **15 × 5 × 15 mm** | Fixed envelope |
| Web | **1.5 mm** | Outer / inter-hole / back-to-back |
| Face pitch | **6.65 mm** | cavity + web |
| Tube canal (Y) | **5 mm** | Short grip along tube axis |
| Cavity | **Ø5.15 mm** | Press-fit for 5 mm OD |
| Throat | **3.9 mm** | Open C snap |
| Face block height | **6.75 mm** | Per side |
| Outer corner fillet | **1.0 mm** | Box corners / outer edges; not cavity circles |
| End rounds | cavity subtract only | No extra outer bulges |
| Base / foot | **none** | |

## Parts

| Export name | Role |
| --- | --- |
| `tube_bundle_clamp` | Back-to-back 2+2 clip (model orientation) |
| `tube_bundle_clamp_print` | Same part stood on a Y end for FDM |

Print standing on a Y end (15 × 15 mm on bed, 5 mm tall). No mounting holes.

## Guardrails

- Guides the **outside** of tubing only; not a liquid path or manifold.
- Keep each ingredient on its own tube; this part only groups routing.
- Re-verify snap after filament/printer change against real 5 mm OD silicone.

## Still to verify

- Silicone press-fit with only **5 mm** of canal length.
- Whether 5 mm grip is enough to hold a bundle without sliding.
- Comfortable insertion when two tubes are already seated on the opposite face.
