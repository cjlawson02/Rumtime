# Estardyn 5 kg load cell + HX711

Vendor-typical geometry for the **Estardyn 5 kg + HX711** kit used on the Rumtime bench rig. Estardyn does not publish a dedicated datasheet; the listing matches the common **611N-class straight bar** cell (same text and wiring as Cytron, JOY-IT, SMARTBITBN, SparkFun #5230 class, etc.).

Use as the glass-platform reference for bracket CAD in Onshape.

**Status:** Vendor-typical values captured 2026-06-27 — **caliper the physical unit on receipt** before drilling or locking platform tooling.

**Still to measure:** bar length (**75 vs 80 mm** batch), exact hole center coordinates along the bar axis, cross-section if outside 12.7 mm, wire exit direction, strain-gauge arrow/label orientation on your unit.

## Load cell bar (611N / straight bar, 5 kg)

| Parameter | Typical value | Notes |
| --------- | ------------- | ----- |
| Overall size | **80 × 12.7 × 12.7 mm** | Most common; some batches **75 × 12.7 × 12.7 mm** |
| Cross-section | **12.7 mm square** (~½″) | Also listed as 12.5–15 mm on some SKUs |
| Rated capacity | **5 kg** | Safe overload often ~120–150% |
| Output sensitivity | **~1.0 mV/V** | HX711 handles amplification |
| Material | Aluminum alloy | Strain gauge under white epoxy pad |
| Wire length | **~220–250 mm** (≈22–25 cm) | 4-wire harness to HX711 |
| Mass (cell only) | **~15–33 g** | Kit with HX711 ~33 g |

### Wire colors (to HX711 screw terminals)

| Cell wire | HX711 terminal |
| --------- | -------------- |
| Red | E+ |
| Black | E− |
| Green | A+ |
| White | A− |

Firmware and wiring: [`firmware/bench-rig/README.md`](../../../firmware/bench-rig/README.md).

## Mounting holes

| Feature | Value |
| ------- | ----- |
| Hole count | **4** (2 per end) |
| Fixed end | **2× M4** through-holes (~4 mm) |
| Load end | **2× M5** through-holes (~5 mm) |
| Hole spacing (each end) | **15 mm** center-to-center between the two holes on that end |

### Cantilever mount

- Bolt **one end** to a rigid base (fixed end — typically **M4**).
- The **other end** carries the glass platform and deflects vertically under load (load end — typically **M5**).
- Follow the **arrow/label** on the bar for force direction.
- Do **not** press directly on the white strain-gauge cover.

### Hole layout (typical — verify physically)

On an **80 mm** bar, hole centers are often roughly **~5 mm** in from each end along the bar axis, with the **15 mm** pair spacing across the 12.7 mm width. Exact centerline coordinates are **not** consistent across listings — measure yours before drilling a bracket.

## HX711 breakout (bundled module)

| Parameter | Typical value |
| --------- | --------------- |
| PCB size | **34 × 20 × 3 mm** |
| Supply | **2.6–5.5 V** (use **3.3 V** on ESP32-S3) |
| Interface | 2-wire serial: **DT (DOUT)**, **SCK** |
| Data rate | 10 or 80 SPS (jumper/module dependent) |

Mount the HX711 on the **dry / fixed** side of the platform — keep amplifier wiring short and away from pump motor leads where practical.

## Glass platform (Rumtime)

Mechanical requirements from [`docs/08-mechanical-design.md`](../../../docs/08-mechanical-design.md):

- **Cantilever:** fixed end on structure, load end on platform.
- **Isolate** the platform from pump vibration (flex links, standoffs, compliant mounts) — required for flow-gated dispense, not optional tuning.
- Prevent tubing or nozzle parts from touching the glass/platform during measurement.
- Keep total load **well under 5 kg** (glass + ice + cocktail is fine; design headroom).
- Add overload protection if possible; make the top plate removable/washable.

### Bench layout (starting point)

```text
[Fixed base plate] --M4--> [load cell fixed end]
                                |
                           ~80 mm bar
                                |
[Floating top plate] <--M5-- [load cell load end]
     ~100–120 mm OD/envelope for glass
```

- **~80 mm** cell between a fixed base plate and a **~100–120 mm** floating top plate (room for common cocktail glasses).
- **M4** into the fixed side; **M5** into the platform side.
- Leave wire service loop and HX711 clearance on the fixed end.
- Drip tray must remove without disturbing the cell — see mechanical design doc.

## Onshape sketch (reference assembly)

1. Model the bar as **80 × 12.7 × 12.7 mm** (parameterize length as `bar_length_mm` = 80, override to 75 if calipers disagree).
2. Place **four through-holes** at measured centers after receipt — use construction geometry for the **15 mm** pair spacing per end until measured.
3. Model fixed base and floating top plates as separate parts with **M4/M5** clearance holes on 15 mm centers (verify against physical cell).
4. Add standoffs or flex links between fixed base and enclosure — do not hard-bolt the top plate to the pump structure.
5. Export STL for base/top fit test; verify cantilever arrow direction on the physical cell before first powered weigh.

## Confidence

| Item | Confidence |
| ---- | ---------- |
| Bar envelope **80 × 12.7 × 12.7 mm** | Vendor-typical; well supported across retailers |
| **M4** fixed / **M5** load hole mix | Vendor-typical |
| **15 mm** hole pair spacing per end | Vendor-typical |
| **75 vs 80 mm** length | Batch-dependent — measure |
| Exact hole center coordinates | **Measure on receipt** |

References: [Cytron 5 kg + HX711](https://www.cytron.io/p-5kg-load-cell-with-hx711-amplifier), [Adafruit #5230](https://www.adafruit.com/product/5230), [Zaitronics 5 kg bar](https://zaitronics.com.au/products/5kg-load-cell-sensor), [611N OEM spec (Qiandi)](https://www.gzqiandi.com/product/5kg-aluminum-load-cell-for-kitchen-scale/).
