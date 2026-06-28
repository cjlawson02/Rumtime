# Bench Rig Firmware

Phase 0–1 firmware for **ESP32-S3-DevKitC-1** (e.g. **N16R8**: 16 MB flash, 8 MB PSRAM) + **TB6612FNG** driving two Kamoer KPHM100-class pumps, plus **HX711** load cell for Tests 7–9.

## Wiring (default pins in `include/config.h`)

### TB6612 → ESP32-S3

| TB6612 pin | ESP32-S3 GPIO | Function                       |
| ---------- | ------------- | ------------------------------ |
| AIN1       | 4             | Pump 1 direction               |
| AIN2       | 5             | Pump 1 direction               |
| PWMA       | 6             | Pump 1 PWM                     |
| BIN1       | 7             | Pump 2 direction               |
| BIN2       | 15            | Pump 2 direction               |
| PWMB       | 16            | Pump 2 PWM                     |
| STBY       | 17            | Driver enable (HIGH = active)  |
| VM         | 12 V pump bus | Through hardware cutoff switch |
| VCC        | 3.3 V         | Logic                          |
| GND        | GND           | Common ground with ESP32       |

Pump motor terminals connect to A+/A− and B+/B−. **Use a hardware switch on the 12 V pump supply.**

### HX711 module → ESP32-S3

| HX711 pin | ESP32-S3 GPIO | Notes                          |
| --------- | ------------- | ------------------------------ |
| VCC       | 3.3 V         | Not 5 V on ESP32-S3            |
| GND       | GND           | Common with TB6612 / ESP32     |
| DT (DOUT) | 1             | Change in `config.h` if needed |
| SCK       | 2             | Change in `config.h` if needed |

### Load cell (Estardyn 5 kg bar, bundled with HX711)

Wire to HX711 screw terminals: **Red** E+, **Black** E−, **Green** A+, **White** A−. Mount the cell under the glass platform with mechanical isolation from pump vibration (see `docs/08-mechanical-design.md`).

GPIO **1** and **2** are free on the DevKitC-1 header and do not overlap pump pins (4–7, 15–17). Avoid strapping pins 0, 45, 46.

## USB and serial monitor

Firmware is built with **USB CDC on boot** — use the DevKit **native USB** port (shows as `/dev/cu.usbmodem*` on macOS).

### Recommended: `benchctl.py` (host CLI)

PlatformIO monitor and copy-paste can mangle commands (unicode, `\r` quirks). Use the Python CLI instead:

```bash
cd firmware/bench-rig
pip install -r requirements.txt
python3 scripts/benchctl.py              # interactive
python3 scripts/benchctl.py status
python3 scripts/benchctl.py run both fwd 5000
python3 scripts/benchctl.py dispense 1 50
```

Responses use `err=...` for failures and `done` / `stopped` for success where applicable. Type `version` to confirm **proto=2** parser.

### Fallback: PlatformIO monitor

```bash
pio device monitor -b 115200
```

1. Open the monitor **before** pressing RST (or unplug/replug USB).
2. Press **RST** on the board to see the boot banner.
3. Type commands manually (avoid pasting from chat).

If you only see a blank screen, quit the monitor (Ctrl+C), reopen it, and press **RST** again.

**N16R8 module:** Use the default `esp32-s3-devkitc-1` board profile (8 MB flash). A 16 MB flash / PSRAM PlatformIO profile caused a boot loop on bench (2026-06-27); extra flash is unused until a dedicated partition map is added.

Automated serial scripts can put the S3 into USB download mode — use an open monitor + **RST** for interactive testing.

## Build and flash

Requires [PlatformIO](https://platformio.org/).

```bash
cd firmware/bench-rig
pio run
pio run -t upload
pio device monitor -b 115200
```

Library: [bogde/HX711](https://github.com/bogde/HX711) (Arduino / ESP32).

## Serial commands

| Command          | Example                   | Description                            |
| ---------------- | ------------------------- | -------------------------------------- |
| `help`           |                           | List commands                          |
| `run`            | `run 1 fwd 5000`          | Timed forward/reverse; **`run both fwd 10000`** = both pumps |
| `prime`          | `prime 1 8000`            | Forward prime                          |
| `cal run`        | `cal run 1 20`            | 20 s cal pour — measure ml             |
| `cal`            | `cal 1 1.42`              | Store ml/s for pump 1                  |
| `dispense`       | `dispense 1 30`           | Timed from motor-on + anti-drip        |
| `dispense-gated` | `dispense-gated 1 30`     | Flow-gated pour (Test 9)               |
| `antidrip`       | `antidrip 1 100`          | Reverse ms after pour (default **100**) |
| `tare`           |                           | Zero scale                             |
| `weight`         |                           | Current filtered weight (g)            |
| `weight-stream`  | `weight-stream 100 30000` | Log weight + ΔW; optional duration     |
| `flowcfg`        | `flowcfg 0.03 3 5000`     | Flow threshold, consecutive N, timeout |
| `scalecal`       | `scalecal -7050`          | HX711 calibration factor               |
| `stop`           |                           | Stop all pumps                         |
| `status`         |                           | Pumps, scale, flow config, weight      |

### Flow-gated dispense

`dispense-gated` starts the pump, waits until weight rises above `flowcfg` threshold for N consecutive samples (or times out), then runs the ml timer from that moment. Flow polling uses single-sample reads at ~10 Hz (15 ms interval). Output:

```text
ok=yes|no
gated_delay_ms=<motor-on to flow onset>
timed_ms=<pour duration after gate>
mass_delta_g=<net mass increase>
```

Timed `dispense` keeps motor-on as t=0 for comparison in Test 9.

## Calibration workflow

### Pumps

1. Prime: `prime 1 10000` (adjust ms until nozzle wets).
2. Cal pour: `cal run 1 20` → measure ml in cylinder.
3. Compute ml/s = ml / 20 → `cal 1 <ml_per_s>`.
4. Verify: `dispense 1 30` three times; log in `docs/14-bench-test-protocol.md`.
5. Defaults in `config.h`: **1.75 ml/s**, **100 ms** anti-drip (bench 2026-06-27). Re-`cal` if line length changes.

### Load cell

1. Empty platform → `tare`.
2. Place known mass (e.g. 200 g) → `weight`; adjust `scalecal <factor>` until reading matches.
3. Re-`tare` with glass on platform before pours.

Default calibration factor is in `config.h` (`kScaleCalibrationFactor`); expect to tune on bench.

## Tests 7–9 workflow (serial monitor @ 115200)

Reference: `docs/14-bench-test-protocol.md`, `docs/06-flow-calibration-and-inventory.md`.

### Test 7 — Load cell baseline

| Step | Commands / action                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | Empty platform → `tare` → `weight` (stable ~0)                                                                                           |
| 7.2  | Place empty glass → `weight` (above ~20 g threshold by eye)                                                                              |
| 7.3  | Add ice → `tare` → `weight`                                                                                                              |
| 7.4  | `tare` → `dispense-gated 1 30` → check `mass_delta_g` ≈ 30                                                                               |
| 7.5  | No glass or blocked line → `dispense-gated 1 30` → expect `ok=no` (timeout)                                                              |
| 7.6  | Tared glass; `weight-stream 100 30000`; in another session run `run 1 fwd 30000` / both pumps; compare `peak_abs_dW_g` vs flow threshold |

### Test 9 — Flow-gated vs timed

1. `status` — confirm ml/s, flowcfg, scale ready.
2. Glass on platform → `tare`.
3. **Timed:** `dispense 1 30` — note `mass_delta_g` vs 30 ml target.
4. **Gated:** `tare` → `dispense-gated 1 30` — compare `gated_delay_ms`, `timed_ms`, `mass_delta_g`.
5. Repeat 9.2–9.3 (de-primed / post–anti-drip) with both modes.
6. Tune: `flowcfg <threshold_g> <consecutive> <timeout_ms>` until gated meets tolerance.

Record tuning values in the bench test log table.

## Safety notes

- Firmware sets all outputs off at boot; still use pump power cutoff.
- Do not run reverse into ingredient bottles during cleaning experiments.
- Stall test manually with meter — firmware does not current-limit.
- Flow-gated polling uses single-sample HX711 reads with a 150 ms conversion timeout (~10 Hz effective rate with 15 ms poll interval). If the HX711 disconnects or stops responding, reads time out, `scale_ready` becomes `no` on `status`, and flow detection returns false until power-cycle / re-init.

## Next steps after Phase 1

Replace bench rig with I2C pump modules (PCA9685 + TB6612 on Altium PCB). This firmware stays as bring-up reference; main product firmware will live in a separate tree later.
