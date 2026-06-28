# KPHM100 mount plate

Measured mounting disc on **Kamoer KPHM100-HB-B10** bench units. Use as the pump reference for bracket and cartridge CAD in Onshape.

**Status:** Geometry captured 2026-06-27 — verify on spare/replacement units before locking cartridge tooling.

**Still to measure:** confirm **7 mm** plate thickness on physical unit; full plate outer diameter, pump body height above plate, inlet/outlet barb positions relative to this origin, screw depth / tap engagement on pump bosses.

## Coordinate system

- Units: **millimeters**
- Origin **(0, 0)** = center of the large circle
- **+X** = right, **+Y** = up (top view, looking down at the mount face)

## Features (top view)

| Feature | Value |
| ------- | ----- |
| Central circle (pump body / clearance) | **Ø 33 mm**, center at origin |
| Mounting holes | **4× Ø 3.5 mm** |
| Mounting plate / bracket thickness | **7 mm**, drawing-derived side-view value; verify physically |

### Hole centers (mm)

| # | Role | X | Y |
| - | ---- | -: | -: |
| 1 | Top-left | −15.5 | +15.5 |
| 2 | Top-right | +17.5 | +8.5 |
| 3 | Bottom-left | −17.5 | −8.5 |
| 4 | Bottom-right | +15.5 | −15.5 |

### Pattern notes

The four holes are **not** a symmetric rectangular grid:

- Top row: **15.5 mm** left and **17.5 mm** right of center (X).
- Bottom row: **17.5 mm** left and **15.5 mm** right of center (X).
- Left column: **+15.5 mm** and **−8.5 mm** from center (Y).
- Right column: **+8.5 mm** and **−15.5 mm** from center (Y).

Hole-to-hole spans (center to center, for bracket standoffs):

| Pair | Distance (mm) |
| ---- | -------------: |
| 1 ↔ 2 (top row) | ~33.7 |
| 3 ↔ 4 (bottom row) | ~33.7 |
| 1 ↔ 3 (left column) | ~24.1 |
| 2 ↔ 4 (right column) | ~24.1 |
| 1 ↔ 4 (diagonal) | ~43.8 |
| 2 ↔ 3 (diagonal) | ~38.9 |

## Fit on KPHM100 pump face

- The circular mount plate described here appears to align with the **front mounting face** of the Kamoer **KPHM100-HB-B10** pump.
- The large **Ø 33 mm** circle is the central pump body / head clearance zone and should be **concentric** with the main circular boss or pump-head centerline.
- The four asymmetric mounting holes align with the four screw/boss locations visible on the pump face.
- The asymmetry of the **15.5 / 17.5 mm** X offsets and **8.5 / 15.5 mm** Y offsets means the plate is **keyed to a specific rotational orientation** — do not treat it as a generic rectangular four-hole pattern.
- On the pump drawing, the four receiving holes are labeled **4× Ø 2.4**; the separate mount-plate drawing uses **4× Ø 3.5** clearance holes. That likely means the pump body has smaller screw/tap/core holes and the bracket should use **Ø 3.5 mm clearance** for **M3** hardware unless physical measurement proves otherwise.
- The visible pump-face envelope appears to be about **42.5 mm** wide/tall on the drawing — **drawing-derived only**; verify on the bench unit before relying on it for bracket OD or cartridge cutouts.
- Test-fit with a **paper template** or **thin 3D-printed coupon** before machining or printing the final bracket.

### Orientation check

Confirm hole positions against the pump with this checklist (origin = center of Ø 33 mm circle, +X right, +Y up):

| Hole | X (mm) | Y (mm) |
| ---- | -----: | -----: |
| Top-left | −15.5 | +15.5 |
| Top-right | +17.5 | +8.5 |
| Bottom-left | −17.5 | −8.5 |
| Bottom-right | +15.5 | −15.5 |

If the bracket is rotated **90°** or **mirrored**, hole spacing may look approximately right but will **not** align with the pump bosses — the offset pattern is the orientation key.

## Side view / axial stack

Side-view interpretation (drawing-derived unless noted):

- The side view shows the mounting bracket as the **7 mm axial plate** between the pump-head/body side and the motor/body side.
- The top-view hole pattern and **Ø 33 mm** central clearance are features through or on this **7 mm** bracket.
- The pump head/body projects about **26.9 mm** forward of the bracket.
- The motor/body extends about **50.5 mm** behind the bracket.
- The motor/body diameter is shown as **Ø 27.5 mm**.
- A rear circular boss or collar near the bracket is shown as approximately **Ø 31.1 mm**.
- Treat these as **drawing-derived** until physically measured.

| Side-view feature | Value | Confidence |
| ----------------- | ----: | ---------- |
| Pump head/body projection forward of bracket | 26.9 mm | Drawing-derived |
| Mounting bracket / plate thickness | 7 mm | Drawing-derived; likely correct |
| Motor/body length behind bracket | 50.5 mm | Drawing-derived |
| Motor/body diameter | Ø 27.5 mm | Drawing-derived |
| Rear boss/collar near bracket | Ø 31.1 mm | Drawing-derived |

**Design implications:**

- Model the bracket as a **7 mm extrude** unless physical measurement says otherwise.
- Keep the **Ø 33 mm** central clearance aligned to the pump-head centerline.
- Leave forward clearance for the pump head and tube fittings.
- Leave rear clearance for the motor body and wires.
- Do not use the side-view dimensions to define barb positions unless those are separately measured.

## Onshape sketch (reference part)

1. **Top** plane → new sketch.
2. Origin = plate center.
3. Circle at origin, **Ø 33 mm** (construction or solid per intent).
4. Four circles **Ø 3.5 mm** at the coordinates above.
5. Extrude the bracket/plate to **7 mm** as the current drawing-derived thickness; verify on the physical unit before final tooling. For a bracket-only part, sketch the hole pattern and extrude your stock to **7 mm** unless calipers disagree.

**Bracket pilot holes:** use **Ø 3.5 mm** (clearance for M3) or **Ø 3.2 mm** if you want a light press-fit locator before final fasteners — confirm with a paper/printed template on the physical pump.

## Bracket design hints

- Mirror this hole pattern on the **pump side** of a printed mount; add **≥ 5 mm** flange beyond the outermost hole centers for screw heads/nuts unless using insert nuts from the back.
- Keep the **Ø 33 mm** zone clear for pump body / head rotation service.
- Leave open volume behind the plate for wire exit and tube bend radius (3×5 mm line).
