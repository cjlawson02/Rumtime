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

// HX711 — free header pins; avoid pump GPIO and strapping pins (0, 45, 46).
constexpr int kScaleDout = 1;
constexpr int kScaleSck = 2;

}  // namespace pins

// Default anti-drip reverse (ms) — tune per docs/14-bench-test-protocol.md Test 5.
constexpr unsigned long kDefaultAntiDripMs = 400;

// PWM duty for full-speed bench runs (0–255).
constexpr int kPumpPwmFull = 255;

// HX711 calibration factor — tune on bench with known mass (scalecal command).
constexpr float kScaleCalibrationFactor = -7050.0f;

// Flow-gate defaults — tune via flowcfg / Test 9 (docs/06-flow-calibration-and-inventory.md).
constexpr float kFlowThresholdG = 0.03f;
constexpr int kFlowDetectConsecutive = 3;
constexpr unsigned long kFlowDetectTimeoutMs = 5000;

// Poll interval while waiting for flow onset (ms). Single-sample reads ~10–20 ms.
constexpr unsigned long kFlowSampleIntervalMs = 15;

// Bounded wait for one HX711 conversion (ms). Marks scale not ready on timeout.
constexpr unsigned long kScaleReadTimeoutMs = 150;

// Rolling average depth for readFilteredGrams() / display (RAM only, not blocking).
constexpr uint8_t kScaleFilterReads = 3;
