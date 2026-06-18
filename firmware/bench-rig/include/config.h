#pragma once

// ESP32-S3-DevKitC-1 default GPIO — adjust if your wiring differs.
// TB6612FNG: AIN1/AIN2/PWMA = pump 1, BIN1/BIN2/PWMB = pump 2, STBY = enable.

namespace pins {

constexpr int kPump1In1 = 4;
constexpr int kPump1In2 = 5;
constexpr int kPump1Pwm = 6;

constexpr int kPump2In1 = 7;
constexpr int kPump2In2 = 15;
constexpr int kPump2Pwm = 16;

constexpr int kStandby = 17;

}  // namespace pins

// Default anti-drip reverse (ms) — tune per docs/14-bench-test-protocol.md Test 5.
constexpr unsigned long kDefaultAntiDripMs = 400;

// PWM duty for full-speed bench runs (0–255).
constexpr int kPumpPwmFull = 255;
