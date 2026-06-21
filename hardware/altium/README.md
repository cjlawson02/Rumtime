# Altium Hardware

Rumtime PCBs are designed in **Altium Designer**. Bench validation (Phase 0–1) uses breakouts; the first custom board is the **4-pump module** (Phase 2).

## Repo layout

```text
hardware/altium/
  README.md                 — this file
  4-pump-module-spec.md     — schematic/block requirements before layout
  4-pump-module/            — Altium project (create in Altium; see below)
    4-pump-module.PrjPcb
    ...
```

Do not commit Altium cache/history blobs — see root `.gitignore`.

## Creating the Altium project

1. In Altium: **File → New Project → PCB Project** → save as `hardware/altium/4-pump-module/4-pump-module.PrjPcb`.
2. Add schematic sheets per `4-pump-module-spec.md`.
3. Link schematic to PCB; run ERC/DRC before fab.
4. Commit: `.PrjPcb`, `.SchDoc`, `.PcbDoc`, generated BOM CSV if useful — not `Project Outputs/` or `History/`.

## Design sequence

| Phase | Board                      | Action                                              |
| ----- | -------------------------- | --------------------------------------------------- |
| 0–1   | None                       | TB6612 breakout on breadboard; HX711 + load cell    |
| 1b    | None                       | PCA9685 breakout on I2C (Test 10) before module fab |
| 2     | 4-pump module              | First fab — one module, 4 pumps                     |
| 4     | Second 4-pump module       | Duplicate validated design                          |
| 5     | Main controller (optional) | Dev board acceptable for v1                         |

Main controller can remain **ESP32-S3 dev board on socket/headers** for v1. Integrate ESP32 on a main PCB only if enclosure warrants it.

## Outputs to generate before order

- Schematic PDF
- Assembly drawing or README silkscreen notes
- BOM (ActiveBOM or CSV)
- Pick-and-place if using assembly house
- Fabrication Gerbers or ODB++ from Altium **Output Job**

## Related docs

- [`docs/05-electronics-and-pcb.md`](../../docs/05-electronics-and-pcb.md) — architecture
- [`docs/12-phase-0-decisions.md`](../../docs/12-phase-0-decisions.md) — locked parts
- [`4-pump-module-spec.md`](4-pump-module-spec.md) — sheet structure and net names

## Gate before fabrication

Do not order PCBs until:

1. Phase 0–1 exit criteria in [`docs/14-bench-test-protocol.md`](../../docs/14-bench-test-protocol.md) pass.
2. Measured pump current (dry and wet stall) recorded in `docs/bench-results/`.
3. **Test 10** PCA9685 I2C path validated on bench ESP32.
4. Load cell Tests 7–9 pass **or** flow-gate fallback is documented for v1 firmware.
