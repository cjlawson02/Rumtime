# Bench Test Protocol

Run this on the Phase 0–1 rig before ordering 4-pump PCBs or the full 8-pump BOM.

Reference: [`09-build-plan-and-verification.md`](09-build-plan-and-verification.md), [`12-phase-0-decisions.md`](12-phase-0-decisions.md).

## Setup checklist

Before first liquid test:

- [ ] Pumps labeled P1, P2 (and P3 if spare in rotation).
- [ ] 12 V pump feed has **inline switch**; logic can stay powered separately.
- [ ] Tubing ID/OD measured and recorded.
- [ ] No leaks at barbs under dry prime pressure (clamp tightness checked).
- [ ] Multimeter/clamp meter ready for current tests.
- [ ] Graduated cylinder or scale ready.
- [ ] Firmware flashed (`firmware/bench-rig/`); serial monitor connects at 115200 baud.

## Test 1 — Electrical baseline

| Step | Action                               | Pass                   | Fail notes                        |
| ---- | ------------------------------------ | ---------------------- | --------------------------------- |
| 1.1  | Measure 12 V at PSU under no load    | V = _____              |                                   |
| 1.2  | Run P1 forward 10 s, no liquid       | I_run = _____ A        |                                   |
| 1.3  | Stall P1 briefly (block rotor < 2 s) | I_stall = _____ A      | Must be < 1.2 A continuous target |
| 1.4  | Repeat 1.2–1.3 for P2                |                        |                                   |
| 1.5  | Run P1 + P2 together 10 s            | V_sag = _____ V        |                                   |
| 1.6  | Toggle pump power cutoff during run  | Pumps stop immediately |                                   |

**Pass:** Running current documented; stall current acceptable for TB6612; cutoff works.

## Test 2 — Prime and leak

| Step | Action                                | Pass     | Fail notes |
| ---- | ------------------------------------- | -------- | ---------- |
| 2.1  | Prime P1 with water until nozzle wets | No leaks |            |
| 2.2  | Prime P2 with water                   | No leaks |            |
| 2.3  | Inspect barbs/clamps after 5 min      | Dry      |            |

## Test 3 — Flow calibration

Per pump, use water, line primed.

Calibration run: fixed **20 s** forward at 12 V (or firmware `cal 20`).

| Pump      | Run time (s) | Output (ml) | ml/s | Notes |
| --------- | -----------: | ----------: | ---: | ----- |
| P1        |           20 |             |      |       |
| P1 repeat |           20 |             |      |       |
| P2        |           20 |             |      |       |
| P2 repeat |           20 |             |      |       |

Store `ml_per_second` in firmware or log below.

## Test 4 — Pour repeatability

Use calibrated ml/s. Targets: **15 ml**, **30 ml**, **60 ml**. Three trials each.

### Pump P1 — water

| Target (ml) | Trial | Actual (ml) | Error (ml) | Pass? |
| ----------: | ----: | ----------: | ---------: | ----- |
|          15 |     1 |             |            |       |
|          15 |     2 |             |            |       |
|          15 |     3 |             |            |       |
|          30 |     1 |             |            |       |
|          30 |     2 |             |            |       |
|          30 |     3 |             |            |       |
|          60 |     1 |             |            |       |
|          60 |     2 |             |            |       |
|          60 |     3 |             |            |       |

Repeat table for **P2**.

**Pass (v1):** Most trials within **±5–10 ml** of target after priming. Tighten tolerance after first data.

## Test 5 — Anti-drip reverse

Start with **400 ms** reverse after each pour. Tune in 100 ms steps.

| Pump | Liquid | Forward (ml) | Reverse (ms) | Drip after 10 s (0–3) | Prime lost? |
| ---- | ------ | -----------: | -----------: | --------------------: | ----------- |
| P1   | water  |           30 |          200 |                       |             |
| P1   | water  |           30 |          400 |                       |             |
| P1   | water  |           30 |          600 |                       |             |
| P1   | water  |           30 |          800 |                       |             |
| P1   | syrup  |           15 |      best ms |                       |             |
| P2   | water  |           30 |      best ms |                       |             |

**Pass:** Acceptable drip (subjective ≤1/3) without needing re-prime before next pour.

Record chosen `anti_drip_reverse_ms` per pump:

```text
P1: _____ ms
P2: _____ ms
```

## Test 6 — Viscous ingredients

Session test with **simple syrup** and **grenadine** (separate lines or flush between).

| Step | Action                        | Pass                   | Fail notes |
| ---- | ----------------------------- | ---------------------- | ---------- |
| 6.1  | Dispense 15 ml syrup × 3      | Repeatable enough      |            |
| 6.2  | Warm-water flush 60 s forward | Runs clear, not sticky |            |
| 6.3  | Dispense 15 ml grenadine × 3  |                        |            |
| 6.4  | Warm-water flush 60 s         | Color mostly gone      |            |
| 6.5  | Sniff/nozzle inspect next day | No sticky residue/odor |            |

## Test 7 — Load cell (if installed)

| Step | Action                                | Pass                          |
| ---- | ------------------------------------- | ----------------------------- |
| 7.1  | Empty platform → tare                 | Stable reading                |
| 7.2  | Place empty glass                     | Detected over threshold       |
| 7.3  | Add ice, tare again                   | Stable                        |
| 7.4  | Dispense 30 ml while logging weight   | Mass increase ≈ 30 g          |
| 7.5  | Run pump with no glass / blocked line | No-flow or warning path works |

## Test 8 — Safety / firmware

| Step | Action                      | Pass                         |
| ---- | --------------------------- | ---------------------------- |
| 8.1  | Reset ESP32 during dispense | Pumps stop or remain off     |
| 8.2  | Power on with cutoff open   | No pump motion until enabled |
| 8.3  | `stop` serial command       | Immediate stop               |

## Phase 0–1 exit decision

Proceed to **4-pump Altium module** only if:

- [ ] Two pumps pass repeatability (Test 4).
- [ ] Anti-drip setting found (Test 5).
- [ ] Syrup/grenadine flush acceptable (Test 6).
- [ ] Stall current confirmed safe for TB6612 (Test 1).
- [ ] No architecture change required.

If fail: document cause, try tubing/clamps/voltage/pump swap before changing architecture.

## Session log template

Copy for each bench session.

```text
Date: __________
Operator: __________
PSU: __________ V / __________ A model
Pumps: KPHM100-HBB10  SN/batch: __________
Firmware: bench-rig @ git ________

Ambient notes:
Temperature: __________
Voltage at pump bus under load: __________

Summary:
- Best ml/s P1: __________  P2: __________
- Anti-drip ms P1: __________  P2: __________
- Stall current P1: __________  P2: __________
- Issues:
- Next actions:
```

## Results archive

Store completed logs under `docs/bench-results/` (create dated markdown or CSV). Agents can update decisions and BOM from measured data in those files.
