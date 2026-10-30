# KiCad Hardware

Rumtime PCBs are designed in **KiCad 10**. Bench validation (Phase 0–1) uses breakouts; the first custom board is the **4-pump module** (Phase 2).

Installed on this machine: **KiCad 10.0.5** (`kicad-cli` on PATH via Homebrew).

## Repo layout

```text
hardware/kicad/
  README.md
  4-pump-module-spec.md     — nets, pin map, safe-off (source of truth before symbols)
  4-pump-module/            — KiCad project
  main-controller-spec.md   — motherboard nets / connectors
  main-controller/          — KiCad project
    Rumtime.pretty/           — local footprints (Mini560)
    fp-lib-table
  scripts/
    check.sh                — ERC (+ DRC); default both boards
    export.sh               — PDF / netlist / BOM; --fab for Gerbers
  out/                      — generated (gitignored)
```

## Agent / CLI hook

`kicad-cli` cannot place symbols. Use it to **check and export** after schematic/layout edits in KiCad.

```bash
kicad-cli version
hardware/kicad/scripts/check.sh                       # ERC both boards
hardware/kicad/scripts/check.sh main-controller       # one board
hardware/kicad/scripts/check.sh --drc                 # ERC + DRC (after Edge.Cuts)
hardware/kicad/scripts/export.sh                      # PDF + netlist
hardware/kicad/scripts/export.sh --fab                # Gerbers + drill + STEP
```

Useful one-shots:

```bash
kicad-cli sch erc --exit-code-violations hardware/kicad/4-pump-module/4-pump-module.kicad_sch
kicad-cli sch erc --exit-code-violations hardware/kicad/main-controller/main-controller.kicad_sch
kicad-cli pcb drc --schematic-parity --exit-code-violations hardware/kicad/4-pump-module/4-pump-module.kicad_pcb
kicad-cli sch export pdf --output hardware/kicad/out/sch.pdf hardware/kicad/4-pump-module/4-pump-module.kicad_sch
```

Open the GUI:

```bash
open -a KiCad hardware/kicad/4-pump-module/4-pump-module.kicad_pro
open -a KiCad hardware/kicad/main-controller/main-controller.kicad_pro
```

## Design sequence

| Phase | Board                      | Action                                              |
| ----- | -------------------------- | --------------------------------------------------- |
| 0–1   | None                       | TB6612 breakout on breadboard; HX711 + load cell    |
| 2     | 4-pump module              | First fab — Test 10 I2C bring-up on this board      |
| 4     | Second 4-pump module       | Duplicate validated design                          |
| 5     | Main controller            | PCB ordered 2026-10-29. DevKit socketed. |

Fill schematic sheets per [`4-pump-module-spec.md`](4-pump-module-spec.md) / [`main-controller-spec.md`](main-controller-spec.md). **4-pump** PCB ordered 2026-10-25 (OSH Park). **Main-controller** PCB ordered 2026-10-29. Commit `.kicad_pro` / `.kicad_sch` / `.kicad_pcb` — not `out/` or `*-backups/`.

## Gate before fabrication

HX711 / load cell is on the **ESP32 controller**, not this module. Tests 7–9 do **not** gate schematic or fab.

Do not **order** boards until:

1. Measured pump current (dry and wet stall) recorded in `docs/bench-results/`. _(Done — TB6612 OK.)_
2. `scripts/check.sh` ERC (and DRC) clean. _(ERC done 2026-08-16; DRC after Edge.Cuts.)_
3. Schematic safe-off review (Test 10.4: IN1/IN2 PDs, STBY PD, PWM strap, MCP23017 /RESET).

**Do not** wait on an MCP23017 breakout. Test 10.1–10.3 run on the first assembled module.

Layout may continue now. Phase 1 pour completeness (Tests 4, 6, 7–9, P3) is parallel v1 work — see [`docs/14-bench-test-protocol.md`](../../docs/14-bench-test-protocol.md).
