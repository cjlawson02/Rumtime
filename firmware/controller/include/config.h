#pragma once

#include <cstdint>

// ESP32-S3-DevKitC-1 pin map — copied from firmware/bench-rig/include/config.h.
// TB6612FNG: AIN1/AIN2/PWMA = pump 1, BIN1/BIN2/PWMB = pump 2, STBY = enable.

namespace pins {

constexpr int kPump1In1 = 4;
constexpr int kPump1In2 = 5;
constexpr int kPump1Pwm = 6;

constexpr int kPump2In1 = 7;
constexpr int kPump2In2 = 15;
constexpr int kPump2Pwm = 16;

constexpr int kStandby = 17;

// Optional cutoff sense (DPDT aux pole or VM divider). -1 = not wired.
// See docs/16 "MachineInputs" — software coherence only; rocker on VM is the real disable.
constexpr int kCutoffSense = -1;

// HX711 — reserved for subsystem 2 (scale); avoid pump GPIO and strapping pins (0, 45, 46).
constexpr int kScaleDout = 1;
constexpr int kScaleSck = 2;

}  // namespace pins

// PWM duty for full-speed runs (0–255).
constexpr int kPumpPwmFull = 255;

// Dispense defaults — copied from firmware/bench-rig/include/config.h (bench-validated
// 2026-06-27). Open-loop ml/s calibration model and anti-drip reverse; re-cal per line.
constexpr float kDefaultMlPerSecond = 1.75f;
constexpr unsigned long kDefaultAntiDripMs = 100;

// Dispense safety ceilings. Open-loop timed mode trusts (ml * calibration), so a
// malformed / mis-calibrated request could otherwise run a pump unbounded. The
// coordinator REJECTS (does not silently clamp) any job exceeding either limit,
// so the operator never gets a wrong volume without notice. The effective max is
// min(kMaxDispenseMl, kDefaultMlPerSecond * kMaxPourDurationMs / 1000).
constexpr float kMaxDispenseMl = 500.0f;
constexpr unsigned long kMaxPourDurationMs = 120000;  // 120 s hard pump-on ceiling

// ControlTask period — docs/16 default 5 ms (1–10 ms acceptable).
constexpr unsigned long kControlTaskPeriodMs = 5;

// ControlTask placement — docs/16: Core 1, priority above async HTTP/Wi-Fi.
constexpr int kControlTaskCore = 1;
constexpr unsigned int kControlTaskPriority = 10;
// ESP-IDF xTaskCreatePinnedToCore expects stack depth in bytes.
constexpr unsigned int kControlTaskStackBytes = 4096;
constexpr unsigned int kControlTaskWdtTimeoutMs = 2000;

// Scale (HX711) — copied from firmware/bench-rig/include/config.h.
// HX711 calibration factor — tune on bench with known mass.
constexpr float kScaleCalibrationFactor = -7050.0f;

// Flow-gate defaults — tune via Test 9 (docs/06-flow-calibration-and-inventory.md).
constexpr float kFlowThresholdG = 0.03f;
constexpr int kFlowDetectConsecutive = 3;
constexpr unsigned long kFlowDetectTimeoutMs = 5000;

// Rolling average depth for readFilteredGrams() (RAM only). Also the raw-sample
// count for a tare, spread across ControlTask ticks (never blocking).
constexpr uint8_t kScaleFilterReads = 3;
static_assert(kScaleFilterReads > 0, "kScaleFilterReads must be > 0");

// Bounded HX711 init wait in begin() only (setup(), never in tick()).
constexpr unsigned long kScaleBeginTimeoutMs = 2000;

// No successful conversion within this window marks the scale stale (not ready).
constexpr unsigned long kScaleStaleTimeoutMs = 1000;
