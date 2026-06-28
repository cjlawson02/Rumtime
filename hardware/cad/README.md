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
│   └── estardyn-load-cell.md
├── src/                # rumtime_cad package (build123d models)
│   ├── _dims.py
│   ├── kphm100_hole_coupon.py
│   ├── kphm100_mount_bracket.py
│   └── load_cell_platform.py
├── scripts/
│   └── export.py       # STL + STEP export CLI
└── out/                # gitignored STL/STEP; created by scripts/export.py
```

| Ref doc | Part |
| ------- | ---- |
| [`refs/kphm100-mount-plate.md`](refs/kphm100-mount-plate.md) | KPHM100 pump foot / mounting disc |
| [`refs/estardyn-load-cell.md`](refs/estardyn-load-cell.md) | Estardyn 5 kg bar + HX711 glass platform |

## Workflow decision

**Verdict:** **build123d** (Python on OCCT) is the single parametric source of truth in git. **Keep Onshape** for assembly review, Altium PCB-outline import, and occasional hand edits — not for agent-driven iteration.

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
| Import Altium PCB outline (Phase 2) | Onshape API for agent design loops |
| Visual review of imported STEP | Locking bracket dims only in cloud |

### Parts in `src/`

| Export name | Module | Description |
| ----------- | ------ | ----------- |
| `kphm100_hole_coupon` | `kphm100_hole_coupon.py` | Thin fit-test plate, asymmetric hole pattern |
| `kphm100_mount_bracket` | `kphm100_mount_bracket.py` | 7 mm mount bracket, Ø33 clearance, M3 holes |
| `load_cell_base` | `load_cell_platform.py` | Fixed-end plate (M4, vendor-typical holes) |
| `load_cell_top` | `load_cell_platform.py` | Floating glass platform (M5, ~110 mm OD) |

*Decision date: 2026-06-27. Revisit only if OCCT wheels break on target Python or prismatic OCCT proves insufficient (then hand-finish imported STEP in Onshape only).*

## Export

```bash
cd hardware/cad
python -m venv .venv && source .venv/bin/activate
pip install -e .
python scripts/export.py --all
python scripts/export.py kphm100_mount_bracket
```

Optional preview: `pip install -e ".[preview]"` + [OCP CAD Viewer](https://marketplace.visualstudio.com/items?itemName=bernhard-42.ocp-cad-viewer) in Cursor.
