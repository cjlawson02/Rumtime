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
- [ ] Graduated cylinder and **load cell + HX711** wired (required for Tests 7–9).
- [ ] Restricted **nozzle tip** on outlet (barb + short restriction) before locking anti-drip ms.
- [ ] Firmware flashed (`firmware/bench-rig/`); serial monitor connects at 115200 baud.

## Test 1 — Electrical baseline

| Step | Action                                                 | Pass                   | Fail notes                         |
| ---- | ------------------------------------------------------ | ---------------------- | ---------------------------------- |
| 1.1  | Measure 12 V at PSU under no load                      | V = _____              |                                    |
| 1.2  | Run P1 forward 10 s, no liquid                         | I_run = _____ A        |                                    |
| 1.3  | Stall P1 briefly (block rotor dry, < 2 s)              | I_stall_dry = _____ A  | Must be < 1.2 A continuous target  |
| 1.3b | Stall P1 wet: line primed, **block outlet** ~5 s       | I_stall_wet = _____ A  | Document; drives TB6612 vs DRV8871 |
| 1.4  | Repeat 1.2–1.3b for P2                                 |                        |                                    |
| 1.5  | Run P1 + P2 together 10 s                              | V_sag = _____ V        |                                    |
| 1.5b | **Simultaneous dispense:** P1+P2 each 30 ml; log bus V | V_sag = _____ V        | Preview 8-pump recipe sag          |
| 1.6  | Toggle pump power cutoff during run                    | Pumps stop immediately |                                    |

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
|          30 |     1 |             |            |       |
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

**Pass:** Document under-pour trend; flow-gating (Test 9) should improve vs timed-only.

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
| 8.1  | Reset ESP32 during dispense | Pumps stop or remain off     |
| 8.2  | Power on with cutoff open   | No pump motion until enabled |
| 8.3  | `stop` serial command       | Immediate stop               |

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

- [ ] Two pumps pass repeatability (Test 4).
- [ ] Anti-drip setting found (Test 5); Test 4b trend documented.
- [ ] Syrup/grenadine flush acceptable (Test 6).
- [ ] Stall current safe for TB6612 — dry **and** wet (Test 1); DRV8871 path documented if needed.
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
