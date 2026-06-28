# CAD scaffolding handoff

**Status:** Workflow locked 2026-06-27. **Scaffold implemented:** `pyproject.toml`, `src/`, `scripts/export.py`, optional `cad.yml` CI.

Use this file to spin up a **parent agent** that launches **four parallel subagents** (one workstream each). Merge order: **1 → 2 → 3 → 4** (infra before models; docs last).

---

## Parent agent prompt (copy entire block)

```text
Implement the locked CAD workflow for Rumtime per hardware/cad/README.md.

Read first:
- hardware/cad/README.md (workflow decision)
- hardware/cad/refs/kphm100-mount-plate.md
- hardware/cad/refs/estardyn-load-cell.md
- AGENTS.md (CAD section)

Launch FOUR subagents in parallel (subagent_type generalPurpose), one per workstream below.
Wait for all four; then integrate: ensure export.py imports all parts, links in docs resolve, .gitignore covers out/.

Do NOT commit unless the user asks. Do NOT use Onshape API or cloud CAD tools.

Merge checklist:
- [ ] hardware/cad/pyproject.toml + .gitignore out/
- [ ] hardware/cad/scripts/export.py runs for all parts
- [ ] src/kphm100_hole_coupon.py, kphm100_mount_bracket.py, load_cell_platform.py
- [ ] docs links point to refs/
- [ ] Optional: .github/workflows/cad.yml exports STLs on PR (build123d only, no preview in CI)
```

---

## Workstream 1 — Tooling & layout

**Subagent prompt:**

```text
Rumtime CAD workstream 1: tooling and repo layout.

Context: hardware/cad/README.md locks build123d as sole parametric CAD in git.
refs/ already contains kphm100-mount-plate.md and estardyn-load-cell.md.

Tasks:
1. Add hardware/cad/pyproject.toml:
   - name rumtime-cad (or similar)
   - build123d>=0.11
   - python >=3.10,<3.15
   - optional [preview] extra: ocp-vscode
2. Add hardware/cad/src/__init__.py (empty or package marker)
3. Add hardware/cad/src/_dims.py with shared constants COPIED from refs (KPHM100 hole coords, plate_t=7, clearance_d=33, hole_d=3.5; load cell bar 80x12.7, hole_pair_spacing=15) — comment each constant with "ref: refs/..."
4. Add root .gitignore entry: hardware/cad/out/ and hardware/cad/.venv/
5. mkdir hardware/cad/out/.gitkeep is NOT needed if out/ is gitignored; document export path in README if needed

Verify: pip install -e hardware/cad succeeds (run if network available).

Return: list of files created and any Python version / wheel issues.
```

---

## Workstream 2 — KPHM100 models

**Subagent prompt:**

```text
Rumtime CAD workstream 2: KPHM100 build123d models.

Read hardware/cad/refs/kphm100-mount-plate.md — authoritative hole coordinates and orientation key.

Create hardware/cad/src/kphm100_hole_coupon.py:
- Thin plate (default 2 mm, param HOLE_COUPON_T)
- Four holes Ø3.5 mm at (-15.5,15.5), (17.5,8.5), (-17.5,-8.5), (15.5,-15.5)
- Optional Ø33 construction clearance cut or embossed ring for visual check
- def build() -> Part returning the solid

Create hardware/cad/src/kphm100_mount_bracket.py:
- PLATE_T = 7 mm (drawing-derived)
- Same four holes; central Ø33 clearance (through or pocket)
- Flange beyond outermost holes: param FLANGE_MARGIN_MM default 8
- Rectangular or rounded-rect plate sized from hole bounds + margin
- def build() -> Part

Use build123d idioms (BuildPart, Locations, Hole, etc.). Import shared dims from _dims.py if workstream 1 created it; else inline constants with ref comments.

Do NOT symmetrize holes. Origin at plate center, XY = top view per ref doc.

Return: file paths and brief description of bounding box.
```

---

## Workstream 3 — Load cell platform + export CLI

**Subagent prompt:**

```text
Rumtime CAD workstream 3: load cell platform + export script.

Read hardware/cad/refs/estardyn-load-cell.md.

Create hardware/cad/src/load_cell_platform.py:
- Two parts in one file OR two build functions: fixed_base(), floating_top()
- Fixed base: plate for M4 fixed end, 15 mm hole pair spacing, param bar_length_mm=80
- Floating top: ~110 mm OD/envelope, M5 holes on 15 mm centers for load end
- Cantilever layout per ref doc; keep simple prismatic plates for v0
- def build_base() -> Part, def build_top() -> Part (or build() returning Compound)

Create hardware/cad/scripts/export.py:
- argparse: part name or --all
- Registry mapping names to callables:
  kphm100_hole_coupon, kphm100_mount_bracket, load_cell_base, load_cell_top
- Export to hardware/cad/out/{name}.stl and .step using build123d export
- Run from repo root or hardware/cad with sys.path handling

Mark hole positions as vendor-typical; comment "verify on receipt" where ref doc says so.

Return: example CLI commands and expected output filenames.
```

---

## Workstream 4 — Docs, links, AGENTS.md, optional CI

**Subagent prompt:**

```text
Rumtime CAD workstream 4: documentation integration.

Tasks:
1. Update docs/08-mechanical-design.md links:
   - hardware/cad/kphm100-mount-plate.md → hardware/cad/refs/kphm100-mount-plate.md
   - same for estardyn-load-cell.md
2. Update README.md document map line for hardware/cad/ to mention build123d + refs/
3. Ensure hardware/cad/README.md matches implemented layout (do not duplicate HANDOFF status if scaffold complete — update "planned" to actual)
4. AGENTS.md already has CAD section — verify or add if missing
5. Optional: .github/workflows/cad.yml
   - trigger on hardware/cad/src/** or pyproject.toml
   - pip install build123d, run export.py --all
   - upload out/*.stl as artifact (do not fail if OCCT install heavy — document in workflow comment)

Do not invent new CAD tool choices; workflow is locked to build123d per hardware/cad/README.md.

Return: list of doc files changed and broken-link check.
```

---

## Single-agent alternative

If you prefer **one agent, no subagents**, use this prompt:

```text
Implement full Rumtime CAD scaffold per hardware/cad/HANDOFF.md workstreams 1–4 in order.
Read hardware/cad/README.md and both refs/*.md first.
build123d only; no Onshape API. Do not commit unless asked.
Deliver: pyproject.toml, src/*.py, scripts/export.py, doc link fixes, .gitignore, optional cad.yml CI.
```

---

## After scaffold: iteration prompts (you + agent)

**Tweak bracket flange:**

```text
Read hardware/cad/refs/kphm100-mount-plate.md and src/kphm100_mount_bracket.py.
Increase FLANGE_MARGIN_MM to 10 and add a wire exit slot 12×6 mm on the motor side.
Re-export instructions in README.
```

**Sync after calipers:**

```text
Physical measurement: plate thickness 7.2 mm, hole 1 at (-15.4, 15.6).
Update refs/kphm100-mount-plate.md and src/_dims.py + affected models; same commit.
```

**Print prep:**

```text
Export kphm100_hole_coupon to out/ and summarize orientation checklist from refs so I can verify rotation on the pump.
```
