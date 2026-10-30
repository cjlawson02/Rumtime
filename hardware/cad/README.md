# Mechanical CAD

Parametric bench and product mechanical parts for Rumtime. **Locked workflow (2026-06-27)** — see [Workflow decision](#workflow-decision). Agent iteration prompts: [`HANDOFF.md`](HANDOFF.md).

## Layout

```text
hardware/cad/
├── README.md           # this file
├── HANDOFF.md          # agent iteration prompts
├── pyproject.toml      # build123d dependency (pip install -e .)
├── refs/               # measured / vendor geometry — provenance
│   ├── kphm100-mount-plate.md
│   ├── estardyn-load-cell.md
│   ├── four-pump-block.md
│   └── tube-bundle-clamp.md
├── src/                # rumtime_cad package (build123d models)
│   ├── _dims.py
│   ├── kphm100_pump.py
│   ├── load_cell_bar.py
│   ├── load_cell_platform.py
│   ├── load_cell_bench.py
│   ├── four_pump_block.py
│   ├── four_pump_block_coupons.py
│   └── tube_bundle_clamp.py
├── scripts/
│   └── export.py       # STL + STEP export CLI
└── out/                # gitignored STL/STEP; created by scripts/export.py
```

| Ref doc | Part |
| ------- | ---- |
| [`refs/kphm100-mount-plate.md`](refs/kphm100-mount-plate.md) | KPHM100 pump foot / mounting disc |
| [`refs/estardyn-load-cell.md`](refs/estardyn-load-cell.md) | Estardyn 5 kg bar + HX711 glass platform |
| [`refs/four-pump-block.md`](refs/four-pump-block.md) | Fixed-floor 1×4 pump enclosure with top tube-routing slider |
| [`refs/tube-bundle-clamp.md`](refs/tube-bundle-clamp.md) | Back-to-back 2+2 tube clip (no base) |

## Workflow decision

**Verdict:** **build123d** (Python on OCCT) is the single parametric source of truth in git. **Keep Onshape** for assembly review, KiCad PCB-outline import, and occasional hand edits — not for agent-driven iteration.

### Tool choices (locked)

| Role | Tool | Notes |
| ---- | ---- | ----- |
| **Parametric parts in git** | **build123d** | Brackets, coupons, scale platform, later cartridge shells |
| **Dimension provenance** | **`refs/*.md`** | Caliper/drawing values; update before changing `src/` |
| **Assembly / review** | **Onshape** | Import STEP; mates, visual sanity; keep subscription |
| **FDM output** | STL from `scripts/export.py` | Do not commit `out/` to main |
| **Onshape handoff** | STEP export | One-way into Onshape; no reverse sync as source of truth |

**Rejected as primary:** OpenSCAD (optional coupon-only later), CadQuery (same kernel, worse agent ergonomics), Onshape API/MCP, cloud generative CAD (Zoo/Ganda/CADAM) except one-shot bootstrap → export → commit.

### Iteration loop (builder + Cursor agent)

1. Measure on bench → update `refs/*.md`.
2. Agent edits `src/*.py` constants/geometry to match refs.
3. `python hardware/cad/scripts/export.py <part>` → `out/*.stl` + `out/*.step`.
4. Print test coupon → fit on hardware → log in `docs/bench-results/` if dims change.
5. Import STEP to Onshape only when assembling cartridge/enclosure.

### Agent editing rules

- Read matching `refs/*.md` before editing `src/`.
- **Never symmetrize** the KPHM100 hole pattern — copy coordinates from the ref doc.
- Params at top of each model file; no magic numbers in geometry.
- Update `refs/` and `src/` in the same commit when a measurement changes.
- Min bracket flange **≥ 5 mm** beyond outermost hole centers (per mount-plate ref).
- Do not commit `out/*.stl` / `out/*.step`; do not add native Onshape files to git.

### Onshape role (keep subscription)

| Use | Do not use |
| --- | ---------- |
| Multi-part assembly layout | Parametric iteration duplicate of git |
| Import KiCad PCB outline / STEP (Phase 2) | Onshape API for agent design loops |
| Visual review of imported STEP | Locking bracket dims only in cloud |

### Parts in `src/`

| Export name | Module | Description |
| ----------- | ------ | ----------- |
| `kphm100_pump` | `kphm100_pump.py` | Measured pump, tube-clearance, motor, and terminal fit envelope |
| `load_cell_bar` | `load_cell_bar.py` | Measured 75 mm bar envelope (holes at 5 / 15 / 59 / 69) |
| `load_cell_base` | `load_cell_platform.py` | Fixed / wire-end plate — later product |
| `load_cell_top` | `load_cell_platform.py` | Floating glass platform (~110 mm OD) — later product |
| `load_cell_fixed_cleat` | `load_cell_bench.py` | Bench U-cleat + C-clamp tab (wire end); print this first |
| `load_cell_load_pad` | `load_cell_bench.py` | Bench 70 mm nest pad (arrow end); print this first |
| `load_cell_bench_pin` | `load_cell_bench.py` | One headed taper pin for the M4 taps (no metal screw) |
| `load_cell_bench_pin_set` | `load_cell_bench.py` | Four pins on one plate |
| `four_pump_block_body` | `four_pump_block.py` | Fixed-floor shell with front channels and top slider grooves |
| `four_pump_block_front_plate` | `four_pump_block.py` | 2 mm sliding 1×4 pump interface |
| `four_pump_block_front_plate_print` | `four_pump_block.py` | Pump panel rotated broad-face-down for FDM |
| `four_pump_block_top_tube_panel` | `four_pump_block.py` | Flat top slider with 4 exterior press-fit tube clamps |
| `four_pump_block_top_tube_panel_print` | `four_pump_block.py` | Tube panel flat-down / clamps-up for FDM |
| `four_pump_block_pcb_rear` | `four_pump_block.py` | Provisional fixed-rear PCB keep-out |
| `four_pump_block_clearance_rear` | `four_pump_block.py` | STEP/STL review assembly with rear PCB layout |
| `four_pump_block_clearance_rear_top_off` | `four_pump_block.py` | Assembly without the top tube panel |
| `four_pump_block_mount_coupon` | `four_pump_block_coupons.py` | Single front-panel station (Ø32 + keyed M3) |
| `four_pump_block_tube_clamp_coupon` | `four_pump_block_coupons.py` | Real 4-throat clamp cluster on a small pad |
| `four_pump_block_front_channel_coupon` | `four_pump_block_coupons.py` | Short front-panel U-channel (use mount coupon as insert) |
| `tube_bundle_clamp` | `tube_bundle_clamp.py` | Back-to-back 2+2 tube clip (no base) |
| `tube_bundle_clamp_print` | `tube_bundle_clamp.py` | Same clip stood on a Y end for FDM |

*Decision date: 2026-06-27. Revisit only if OCCT wheels break on target Python or prismatic OCCT proves insufficient (then hand-finish imported STEP in Onshape only).*

## Export

```bash
cd hardware/cad
python -m venv .venv && source .venv/bin/activate
pip install -e .
python scripts/export.py --all
python scripts/export.py load_cell_bar
python scripts/export.py load_cell_fixed_cleat
python scripts/export.py load_cell_load_pad
python scripts/export.py load_cell_bench_pin_set
python scripts/export.py four_pump_block_mount_coupon
python scripts/export.py four_pump_block_tube_clamp_coupon
python scripts/export.py four_pump_block_front_channel_coupon
python scripts/export.py four_pump_block_clearance_rear
python scripts/export.py tube_bundle_clamp
python scripts/export.py tube_bundle_clamp_print
```

Optional preview: `pip install -e ".[preview]"` + [OCP CAD Viewer](https://marketplace.visualstudio.com/items?itemName=bernhard-42.ocp-cad-viewer) in Cursor.
