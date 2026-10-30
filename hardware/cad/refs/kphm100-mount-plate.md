# KPHM100 mount plate

Measured **Kamoer KPHM100-HB-B10** pump envelope and integral mounting plate.
Use this as the pump reference for build123d mounting-interface and enclosure CAD.

**Status:** Mount pattern captured 2026-06-27; fit-check envelope iterated from
physical measurements on 2026-07-18. Coupon fit **2026-07-19**
([session 05](../../../docs/bench-results/2026-07-19-session-05.md)): keyed holes
**pass**; interface clearance updated to **Ø 32 / Ø 3.3** after first print.
Suitable for enclosure clearance work, but not manufacturing tooling.

**Still to verify:** exact 7 mm integral-plate thickness, the estimated 6 mm
blind-hole depth and thread, detailed barb profile, shaft, wire exits, and
whether replacement pumps share the same envelope.

## Coordinate system

- Units: **millimeters**
- Origin **(0, 0)** = center of the large circle
- **+X** = right, **+Y** = up (top view, looking down at the mount face)

## Features (top view)

| Feature | Value |
| ------- | ----- |
| Integral pump plate | **42.5 × 42.5 × 7 mm**, 6.25 mm corner radii |
| Straight portion of each plate edge | **30 mm** |
| Pump receiving holes | **4× Ø 2.4 mm**, approximately 6 mm blind depth from motor side |
| Recommended mounting-interface clearance | **Ø 32 mm** central opening; **4× Ø 3.3 mm** screw clearance |

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

- The 42.5 mm rounded plate is an **integral part of the pump**.
- The **Ø 32 mm** circle is the recommended opening in the separate custom
  mounting interface, concentric with the Ø31 mm rear shim.
- The four asymmetric Ø2.4 mm blind holes receive screws from the motor side.
- The asymmetry of the **15.5 / 17.5 mm** X offsets and **8.5 / 15.5 mm** Y offsets means the plate is **keyed to a specific rotational orientation** — do not treat it as a generic rectangular four-hole pattern.
- Use **Ø3.3 mm clearance holes** in the custom interface for likely M3
  hardware; verify thread and engagement before final fastener selection.
- Test-fit with a **paper template** or **thin 3D-printed coupon** before machining or printing the final bracket.

### Orientation check

The drawing/front-face coordinates above must be mirrored left-to-right when
viewed from the **motor side**, where screws enter the blind holes:

| Motor-side hole | X (mm) | Y (mm) |
| --- | ---: | ---: |
| Top-right | +15.5 | +15.5 |
| Top-left | −17.5 | +8.5 |
| Bottom-right | +17.5 | −8.5 |
| Bottom-left | −15.5 | −15.5 |

The set is unchanged by a 180° rotation but **does change under a mirror**.
Always state which face is being viewed.

## Measured fit envelope

Coordinate convention used by `src/kphm100_pump.py`: X is horizontal, +Y is
rearward toward the motor, and +Z is upward. The integral mounting plate's rear
face is Y=0.

| Feature | Value | Notes |
| --- | ---: | --- |
| Pump housing | **35.28 W × 37 H × 26.66 mm** forward | Centered on plate |
| Housing bottom straight | **21.4 mm** | Gives 6.94 mm lower corner radii |
| Housing vertical straight | **22 mm** | Between lower radius and top arc |
| Housing top arc radius | **~23.33 mm** | Derived from measured width and remaining 8.06 mm rise |
| Front chamfer | **4.5 mm inset × ~2.60 mm axial** | 60° from housing side |
| Side-exit envelope | **Ø 9 mm at 55°** | Smooth tangent sweep into vertical |
| Attached tube envelope | **Ø 6 mm** | Top is 58 mm above housing bottom |
| Overall side-exit width | **50 mm** | Outside-to-outside |
| Rear circular shim | **Ø 31 × 11.9 mm** | Immediately behind plate |
| Motor can | **Ø 27.6 × 32.6 mm** | Immediately behind shim |
| Rear centered boss | **Ø 9.75 × 1.67 mm** | Shaft omitted |
| Rear terminal tabs | **2× 6 × 3 × 0.5 mm** | Top/bottom centers 2 mm inward from can edge |
| Maximum rear projection | **50.5 mm** | Set by terminal tabs |

Barb diameters were observed as approximately **4.3 mm maximum** and **3 mm
minimum**, but the detailed barb profile is not modeled; the Ø6 tube clearance
envelope controls enclosure fit.

**Design implications:**

- The 7 mm plate is part of the pump. A custom mounting interface must sit
  behind it, not replace or overlap it.
- Use the **motor-side mirrored hole coordinates** for the custom interface.
- Keep the **Ø 32 mm** opening concentric so the Ø31 mm shim can pass through.
- Account for the Ø6 tube sweeps above the pump and the 50.5 mm terminal reach
  behind the integral plate.

## Onshape sketch (reference part)

1. View/sketch the custom interface from the **motor side**.
2. Origin = pump centerline.
3. Circle at origin, **Ø 32 mm**.
4. Four circles **Ø 3.3 mm** at the motor-side mirrored coordinates.
5. Extrude the custom interface to the selected thickness behind the integral
   pump plate; do not model the pump's 7 mm plate as empty mounting space.

**Bracket pilot holes:** use **Ø 3.3 mm** (close M3 clearance) or **Ø 3.2 mm** if
you want a light press-fit locator before final fasteners — confirm with a
paper/printed template on the physical pump.

## Bracket design hints

- Mirror the drawing/front-view pattern for a mount viewed from the **motor
  side**; add **≥ 5 mm** flange beyond the outermost hole centers.
- Keep the **Ø 32 mm** zone clear for pump body / head rotation service.
- Leave open volume behind the plate for terminal tabs and wire strain relief;
  reserve the modeled Ø6 tube sweeps in front of the plate.
