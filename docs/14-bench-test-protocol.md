# Bench Test Protocol

Run this on the Phase 0–1 rig before ordering 4-pump PCBs or the full 8-pump BOM.

Reference: [`09-build-plan-and-verification.md`](09-build-plan-and-verification.md), [`12-phase-0-decisions.md`](12-phase-0-decisions.md).

**Progress (2026-07-12):** [Session 03](bench-results/2026-07-12-session-03.md) — product FW/kiosk sequential pour (open-loop happy path), cancel, STA-disconnect auto-stop; **scale not wired** (Tests 7–9 still open). Liquid cal still from 2026-06-27: P1+P2 @ **1.75 ml/s**; dual **~0.4 A**; anti-drip **100 ms**; Test 4b P2 **50→~45 ml**. **Outlet:** sessions 01–02 on **open ~3 mm tube**. Logs: [01](bench-results/2026-06-27-session-01.md) · [02](bench-results/2026-06-27-session-02.md) · [03](bench-results/2026-07-12-session-03.md).

## Setup checklist

Before first liquid test:

- [ ] Pumps labeled P1, P2 (and P3 if spare in rotation).
- [ ] 12 V pump feed has **inline switch**; logic can stay powered separately. _(Interim: bench DC supply + current limiter — Chris, 2026-06-27.)_
- [x] Tubing ID/OD — **waived** (visual 3×5 mm class OK on bench; fits KPHM100 B10 head).
- [ ] No leaks at barbs under dry prime pressure (clamp tightness checked).
- [ ] Multimeter/clamp meter ready for current tests.
- [x] Graduated cylinder on hand (received 2026-06-27; used session 02).
- [ ] **Load cell bar + HX711** wired (required for Tests 7–9). _(Ordered 2026-06-23; **not wired** as of session 03 / 2026-07-12.)_
- [ ] Restricted **nozzle tip** on outlet before locking anti-drip ms. Target: orifice **smaller than 3 mm line** (e.g. short barb + restricted fitting, or mis-shipped **1.8 mm ID** silicone coupler while still on hand: 3×5 mm tube into one end, pour from other; clamp 5 mm OD side). Re-run Tests 3–5 after adding restriction — ml/s and anti-drip ms from sessions 01–02 were measured on **open outlet**.
- [x] Firmware flashed (`firmware/bench-rig/`); serial monitor connects at 115200 baud.

## Test 1 — Electrical baseline

| Step | Action                                                 | Pass                   | Fail notes                         |
| ---- | ------------------------------------------------------ | ---------------------- | ---------------------------------- |
| 1.1  | Measure 12 V at PSU under no load                      | V = **12 V**           | 2026-06-27 session 02             |
| 1.2  | Run P1 forward 10 s, no liquid                         | I_run = **0.20–0.21 A** | 2026-06-27 dry, PSU ammeter       |
| 1.3  | Stall P1 briefly (block rotor dry, < 2 s)              | I_stall_dry = **0.9 A** | 2026-06-27 session 02            |
| 1.3b | Stall P1 wet: line primed, **block outlet** ~5 s       | I_stall_wet = **~0.33 A** | 2026-06-27 session 02          |
| 1.4  | Repeat 1.2–1.3b for P2                                 | **N/A (waived)** | P2 matches P1 @ 1.75 ml/s; dual wet ~0.4 A — stall not repeated |
| 1.5  | Run P1 + P2 together 10 s                              | I ≈ **0.4 A** wet | 2026-06-27; ~2× single-pump ~0.2 A |
| 1.5b | **Simultaneous dispense:** P1+P2 each 30 ml; log bus V | **Deferred** | Large bench DC supply — no measurable sag; **retest on GST60A12** + fuse/cutoff bus |
| 1.6  | Toggle **main power** cutoff during run                | Pumps stop immediately |                                    |

**Pass:** Running current documented; stall current acceptable for TB6612; cutoff works. **P2 stall (1.4) waived** when same pump SKU and P2 run/dispense match P1 — document equivalence in bench log.

## Test 2 — Prime and leak

| Step | Action                                | Pass     | Fail notes |
| ---- | ------------------------------------- | -------- | ---------- |
| 2.1  | Prime P1 with water until nozzle wets | **Pass** — no leaks | ~2500 ms bench; varies with line length |
| 2.2  | Prime P2 with water                   | **Pass** | cal 1.75; dispense 50 ml spot on |
| 2.3  | Inspect barbs/clamps after 5 min      | **Pass** | No leaks after 5 min soak (operator) |

## Test 3 — Flow calibration

Per pump, use water, line primed.

Calibration run: fixed **20 s** forward at 12 V (or firmware `cal 20`).

| Pump      | Run time (s) | Output (ml) | ml/s | Notes |
| --------- | -----------: | ----------: | ---: | ----- |
| P1        |           60 | **100**     | **1.75** | Tuned from 1.67; 50 ml pour ~48 ml, repeats OK |
| P1 repeat |        50 ml | **~48**     | —        | Multiple trials consistent (2026-06-27)        |
| P2        |        — | **50** (target) | **1.75** | Shared cal with P1; 50 ml spot on (2026-06-27) |
| P2 repeat |        — |             |      |       |
| P3        |           20 |             |      |       |
| P3 repeat |           20 |             |      |       |

Store `ml_per_second` in firmware or log below.

## Test 4 — Pour repeatability

Use calibrated ml/s. Targets: **15 ml**, **30 ml**, **60 ml**. Three trials each.

### Pump P1 — water

| Target (ml) | Trial | Actual (ml) | Error (ml) | Pass? |
| ----------: | ----: | ----------: | ---------: | ----- |
|          15 |     1 |             |            |       |
|          15 |     2 |             |            |       |
|          15 |     3 |             |            |       |
|          30 |     1 | **~29**     | ~−1        | 2026-06-27 |
|          50 |   1–3 | **~48**     | ~−2        | Consistent; cal 1.75 |
|          30 |     2 |             |            |       |
|          30 |     3 |             |            |       |
|          60 |     1 |             |            |       |
|          60 |     2 |             |            |       |
|          60 |     3 |             |            |       |

Repeat table for **P2** and **P3** (variance check).

**Pass (v1):** Most trials within **±5–10 ml** of target after priming. Tighten tolerance after first data.

### Test 4b — Sequential pours after anti-drip (no re-prime)

Using best `anti_drip_ms` from Test 5: pour 30 ml × 3 on same line **without** re-priming between pours.

| Pump | Trial | Actual (ml) | Error (ml) | Pass? |
| ---- | ----: | ----------: | ---------: | ----- |
| P1   |     1 |             |            |       |
| P1   |     2 |             |            |       |
| P1   |     3 |             |            |       |
| P2   | 1+2+3 | **~45 total** | −5 vs 50   | Documented — anti-drip 100 ms; 17+17+16 target |

**Pass:** Document under-pour trend; flow-gating (Test 9) should improve vs timed-only. _(P2 split pour: ~45 ml / 50 ml with anti-drip on — bench note only.)_

## Test 5 — Anti-drip reverse

Start with **400 ms** reverse after each pour. Tune in 100 ms steps.

Start with **400 ms** reverse after each pour. Tune in 100 ms steps. _(Bench: 400 ms de-primed short lines; **100 ms** chosen for P1 + P2.)_

| Pump | Liquid | Forward (ml) | Reverse (ms) | Drip after 10 s (0–3) | Prime lost? |
| ---- | ------ | -----------: | -----------: | --------------------: | ----------- |
| P1   | water  |           30 |          400 | —                     | Yes — de-primed |
| P1   | water  |           30 |          **100** | OK                | No          |
| P2   | water  |           30 |          **100** | OK                | No          |

**Pass:** Acceptable drip (subjective ≤1/3) without needing re-prime before next pour.

Record chosen `anti_drip_reverse_ms` per pump:

```text
P1: 100 ms
P2: 100 ms
```

## Test 6 — Viscous ingredients

Session test with **simple syrup** and **grenadine** (separate lines or flush between).

| Step | Action                                                   | Pass                                  | Fail notes |
| ---- | -------------------------------------------------------- | ------------------------------------- | ---------- |
| 6.1  | Dispense 15 ml syrup × 3                                 | Repeatable enough                     |            |
| 6.2  | Warm-water flush 60 s forward                            | Runs clear, not sticky                |            |
| 6.3  | Dispense 15 ml grenadine × 3                             |                                       |            |
| 6.4  | Warm-water flush 60 s                                    | Color mostly gone                     |            |
| 6.5  | Sniff/nozzle inspect next day                            | No sticky residue/odor                |            |
| 6.6  | Repeat 6.5 on **citrus** line if tested                  | No lingering odor                     |            |
| 6.7  | One **Star San** sanitize + water purge per cleaning doc | No sanitizer taste in next water pour |            |

## Test 7 — Load cell baseline (required)

| Step | Action                                                                             | Pass                                   |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| 7.1  | Empty platform → tare                                                              | Stable reading                         |
| 7.2  | Place empty glass                                                                  | Detected over threshold                |
| 7.3  | Add ice, tare again                                                                | Stable                                 |
| 7.4  | Dispense 30 ml while logging weight                                                | Mass increase ≈ 30 g                   |
| 7.5  | Run pump with no glass / blocked line                                              | No-flow or warning path works          |
| 7.6  | **Vibration floor:** tared glass; run 0 / 1 / 2 pumps dry 30 s; log peak \|dW/dt\| | Document noise vs expected flow signal |

## Test 8 — Safety / firmware

| Step | Action                      | Pass                         |
| ---- | --------------------------- | ---------------------------- |
| 8.1  | Reset ESP32 during dispense | **Pass** | Pumps stop or remain off (operator) |
| 8.2  | Power on with cutoff open   | No pump motion until enabled |
| 8.3  | `stop` serial command       | **Pass** (2026-06-27)        |

## Test 9 — Flow-gated dispense (required)

Compare **timed-from-motor-on** vs **flow-gated** (`docs/06-flow-calibration-and-inventory.md`). Glass on platform, tared. Use water unless noted.

| Step | Action                                                                                                     | Timed error (ml) | Gated error (ml) | Pass?                 |
| ---- | ---------------------------------------------------------------------------------------------------------- | ---------------- | ---------------- | --------------------- |
| 9.1  | **Primed line:** 30 ml P1 × 3 each mode                                                                    |                  |                  | Gated ≤ timed         |
| 9.2  | **De-primed:** dry outlet / long idle; 30 ml without re-prime                                              |                  |                  | Gated within ±5–10 ml |
| 9.3  | **Post–anti-drip:** pour 30 ml → anti-drip → immediate second 30 ml                                        |                  |                  | Gated within ±5–10 ml |
| 9.4  | **2-pump simultaneous** (both similarly primed): 30 ml each; log total mass                                |                  |                  | Total within ±10 ml   |
| 9.5  | **Asymmetric:** P1 primed, P2 de-primed; both 30 ml simultaneous — document per-pump cylinder + total mass |                  |                  | Document P2 weakness  |
| 9.6  | **Syrup 15 ml:** flow detected within timeout; no false abort                                              |                  |                  |                       |
| 9.7  | **Glass + ice:** tare; pour 30 ml; no false trigger from ice                                               |                  |                  |                       |

Record tuning values:

```text
flow_threshold_g_per_sample: _____
flow_detect_consecutive_samples: _____
flow_detect_timeout_ms: _____
```

**Pass:** Flow-gated meets Test 4 tolerance on 9.2–9.3; false-trigger rate < 5% on 20 consecutive water pours (9.1). If fail after mechanical isolation iteration: document fallback to timed + sanity check in `docs/bench-results/`.

## Test 10 — I2C path (before Altium fab)

Bench Phase 0 uses direct GPIO → TB6612. Production uses **PCA9685 → TB6612** on the module PCB. Before ordering PCBs:

| Step | Action                                                                      | Pass                            |
| ---- | --------------------------------------------------------------------------- | ------------------------------- |
| 10.1 | Add **PCA9685 breakout** + drive ≥2 pumps via I2C                           | Forward/reverse/stop works      |
| 10.2 | Run pour test while logging I2C errors under motor load                     | No NACK storms / wrong channels |
| 10.3 | Reset ESP32 during I2C-driven dispense                                      | Pumps stop or remain off        |
| 10.4 | Review module schematic: IN1/IN2 pulldowns, STBY, PCA9685 power-on defaults | Documented safe-off state       |

## Phase 0–1 exit decision

Proceed to **4-pump Altium module** only if:

- [ ] Two pumps pass repeatability (Test 4). _(P1 ~48 ml / P2 ~50 ml @ 50 ml target — pass.)_
- [ ] Anti-drip setting found (Test 5); Test 4b trend documented. _(100 ms both pumps; P2 50 ml split → ~45 ml with anti-drip — bench note.)_
- [ ] Syrup/grenadine flush acceptable (Test 6).
- [ ] Stall current safe for TB6612 — dry **and** wet (Test 1); DRV8871 path documented if needed. _(Dry I_run ~0.21 A, I_stall_dry 0.9 A, I_stall_wet ~0.33 A — TB6612 OK.)_
- [ ] **P3** within ~10% ml/s of P1/P2 (Test 3).
- [ ] Load cell Tests 7–9 pass **or** flow-gate fallback documented in `docs/bench-results/`.
- [ ] **Test 10** I2C/PCA9685 path validated.
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
- Best ml/s P1: __________  P2: __________  P3: __________
- Anti-drip ms P1: __________  P2: __________
- Stall dry P1: __________  wet P1: __________  (P2: __________ / __________)
- Flow-gate: threshold __________  timeout __________  pass/fail/fallback
- V_sag 2-pump simultaneous: __________
- Issues:
- Next actions:
```

## Results archive

Store completed logs under `docs/bench-results/` (create dated markdown or CSV). Agents can update decisions and BOM from measured data in those files.
