# Estardyn 5 kg load cell + HX711

**Estardyn 5 kg + HX711** kit on the Rumtime bench. Physical bar measured **2026-08-16** (Chris). Listing class is 611N / YZC-133-style straight bar — this unit is the **75 mm** batch, not 80 mm.

Use as the glass-platform reference. Parametric bar: `src/load_cell_bar.py`.

**Status:** Envelope and hole centers measured 2026-08-16. All four holes are **tapped M4** (caliper bore ~Ø3.5 mm is the minor diameter). Bar **soldered and calibrated 2026-08-20** (`scalecal 374.76`).

## Coordinate system

- Units: **millimeters**
- Origin: **load / arrow end face**, width centerline, bottom of bar
- **+X** toward the wire end (bar length)
- **+Y** toward the **front face** (5 kg ↓ arrow and wires both on this face)
- **+Z** up; mounting holes are **top-to-bottom through-tapped M4**

```text
FRONT FACE  (+Y)

  5 kg ↓ arrow                         wires
  |                                    |
  x=0                                  x=75
  |  o     o                    o     o  |
  |  5    15                   59    69  |   hole centers from load end
  |<-------------- 75 mm --------------->|
```

- **Load end** (platform / pad): arrow side, x = 0. Force arrow points **down** (−Z).
- **Fixed end** (cleat / C-clamp): wire side, x = 75. Cable stays on the stationary end.

Do **not** symmetrize the hole Xs — load-end outer hole is 5 mm in; fixed-end outer hole is 6 mm in from that end.

## Load cell bar (measured)

| Parameter | Value | Notes |
| --------- | ----- | ----- |
| Overall size | **75 × 12.75 × 12.75 mm** | Calipers 2026-08-16; not the 80 mm vendor-typical listing |
| Cross-section | **12.75 mm square** | |
| Rated capacity | **5 kg** | Arrow on front, load end |
| Wire exit | Right / fixed end, front face | ~220–250 mm harness to HX711 |
| Strain gauge | White epoxy on the bar | Do not clamp or press on it |

### Wire colors (to HX711)

| Cell wire | HX711 terminal |
| --------- | -------------- |
| Red | E+ |
| Black | E− |
| Green | A+ |
| White | A− |

Firmware and wiring: [`firmware/bench-rig/README.md`](../../../firmware/bench-rig/README.md).

## Mounting holes (measured)

Through **+Z** (top to bottom). All four on the width centerline (Y = 0).

| Hole | Role | X from load end (mm) | X from wire end (mm) |
| ---- | ---- | -------------------: | -------------------: |
| A | Load outer | 5 | 70 |
| B | Load inner | 15 | 60 |
| C | Fixed inner | 59 | 16 |
| D | Fixed outer | 69 | 6 |

Pair spacing at each end is **10 mm** (not the 15 mm vendor-typical value). All four are **through-tapped M4** — calipers read **~Ø3.5 mm** (minor diameter), same order on both ends. That is **not** the TAL220 M4/M5 mix and **not** an M3 clearance bore.

**Fastener:** **M4** screws through the printed plate, threading **into the bar**. No nut required. Printed-plate clearance: **Ø4.4 mm**.

### Cantilever mount

- Bolt or clamp the **wire / fixed** end to a rigid base.
- The **arrow / load** end carries the glass platform and deflects down under load.
- Follow the **5 kg ↓** arrow for force direction.
- Do **not** press on the white strain-gauge cover. Leave the mid-span of the bar in air.

### Bench cantilever (simple — use this for Tests 7–9)

Do **not** print the 110 mm product plates yet. The bar *is* the cantilever.

**No print:** C-clamp the **wire / fixed** end to the table. Keep the clamp off the epoxy pad and the 4-wire exit. Rest a coaster on the **arrow / load** end.

**Print:** `load_cell_bar` (fit check) + `load_cell_fixed_cleat` + `load_cell_load_pad`.

```text
TABLE ==C-clamp== [fixed U-cleat @ wire end]==== bar (gauge free) ====[70 mm pad @ arrow]
                                                                           [glass]
```

- Drop the wire end into the U-channel; C-clamp the **side tab** only.
- Nest the pad groove on the arrow end; glass on the smooth face. Fasten with **M4** into the bar, or printed `load_cell_bench_pin` taper pins (finger-press only) if metal screws are not on hand.
- Nothing else may touch the cell or the pad during a weigh.

## HX711 breakout (bundled module)

| Parameter | Typical value |
| --------- | --------------- |
| PCB size | **34 × 20 × 3 mm** |
| Headers | Female **1×6 analog** (left) + **1×4 digital** (right) on the motherboard |
| Pin | **0.64 mm** square |
| Row spacing | **20.3 mm** C-C (measured **20.8 mm outer / 19.8 mm inner**) |
| Supply | **2.6–5.5 V** (use **3.3 V** on ESP32-S3) |
| Interface | 2-wire serial: **DT (DOUT) → GPIO 6**, **SCK → GPIO 7** (motherboard; bench was 8/9) |
| Data rate | 10 or 80 SPS (jumper/module dependent) |

Mount the HX711 on the **dry / fixed** side — keep amplifier wiring short and away from pump motor leads where practical.

## Glass platform (Rumtime)

Mechanical requirements from [`docs/08-mechanical-design.md`](../../../docs/08-mechanical-design.md):

- **Cantilever:** fixed end on structure, load end on platform.
- **Isolate** the platform from pump vibration (flex links, standoffs, compliant mounts) — required for flow-gated dispense, not optional tuning.
- Prevent tubing or nozzle parts from touching the glass/platform during measurement.
- Keep total load **well under 5 kg** (glass + ice + cocktail is fine; design headroom).
- Add overload protection if possible; make the top plate removable/washable.

### Bench layout (starting point)

Use the **simple cantilever** above for Tests 7–9. The 110 mm plates (`load_cell_base` / `load_cell_top`) wait until the enclosure.

```text
[C-clamp on cleat tab] --M4 into bar--> [fixed / wire end]
                                              |
                                         75 mm bar (gauge free)
                                              |
[70 mm nest pad] <--M4 into bar-- [load / arrow end]
     glass on the pad
```

- Leave wire service loop and HX711 on the fixed/dry side.
- Drip tray must remove without disturbing the cell — see mechanical design doc.

## Onshape sketch (reference assembly)

1. Import `load_cell_bar` STEP (75 × 12.75 × 12.75, holes at 5 / 15 / 59 / 69).
2. Mate cleat to the wire end and pad to the arrow end — do not re-guess hole Xs.
3. Export STL for a fit test; confirm arrow points down before first powered weigh.

## Confidence

| Item | Confidence |
| ---- | ---------- |
| Bar envelope **75 × 12.75 × 12.75 mm** | Measured 2026-08-16 |
| Hole Xs **5, 15, 59, 69** from load end | Measured 2026-08-16 — do not symmetrize |
| Through-tapped **M4** on centerline (all four) | Confirmed 2026-08-16; Ø3.5 mm is minor diameter |
| M4/M5 mix / 80 mm / 15 mm pair / M3 through | **Superseded** — vendor-typical, wrong for this unit |

References: [Cytron 5 kg + HX711](https://www.cytron.io/p-5kg-load-cell-with-hx711-amplifier), [Adafruit #5230](https://www.adafruit.com/product/5230), [Zaitronics 5 kg bar](https://zaitronics.com.au/products/5kg-load-cell-sensor), [611N OEM spec (Qiandi)](https://www.gzqiandi.com/product/5kg-aluminum-load-cell-for-kitchen-scale/).
