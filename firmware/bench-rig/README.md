# Bench Rig Firmware

Phase 0–1 firmware for **ESP32-S3-DevKitC-1** + **TB6612FNG** driving two Kamoer KPHM100-class pumps.

## Wiring (default pins in `include/config.h`)

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

## Build and flash

Requires [PlatformIO](https://platformio.org/).

```bash
cd firmware/bench-rig
pio run -t upload
pio device monitor -b 115200
```

## Serial commands

| Command    | Example          | Description                |
| ---------- | ---------------- | -------------------------- |
| `help`     |                  | List commands              |
| `run`      | `run 1 fwd 5000` | Timed forward/reverse      |
| `prime`    | `prime 1 8000`   | Forward prime              |
| `cal run`  | `cal run 1 20`   | 20 s cal pour — measure ml |
| `cal`      | `cal 1 1.42`     | Store ml/s for pump 1      |
| `dispense` | `dispense 1 30`  | Timed pour + anti-drip     |
| `antidrip` | `antidrip 1 400` | Reverse ms after pour      |
| `stop`     |                  | Stop all pumps             |
| `status`   |                  | Show calibration           |

## Calibration workflow

1. Prime: `prime 1 10000` (adjust ms until nozzle wets).
2. Cal pour: `cal run 1 20` → measure ml in cylinder.
3. Compute ml/s = ml / 20 → `cal 1 <ml_per_s>`.
4. Verify: `dispense 1 30` three times; log in `docs/14-bench-test-protocol.md`.
5. Tune: `antidrip 1 400` (or other ms per test protocol).

## Safety notes

- Firmware sets all outputs off at boot; still use pump power cutoff.
- Do not run reverse into ingredient bottles during cleaning experiments.
- Stall test manually with meter — firmware does not current-limit.

## Next steps after Phase 1

Replace bench rig with I2C pump modules (PCA9685 + TB6612 on Altium PCB). This firmware stays as bring-up reference; main product firmware will live in a separate tree later.
