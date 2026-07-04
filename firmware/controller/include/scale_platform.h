#pragma once

#include <cstdint>

#include "scale_ops.h"

// Non-blocking HX711 driver for the ControlTask tick (docs/16: no
// wait_ready_timeout loops or delay() after setup()). Ports the bench-rig
// ScaleDriver behavior to a tick-advanced FSM: at most one conversion per
// tick(), tare spread across ticks, cached filtered value for callers.
//
// Distributed safety (docs/16): ScalePlatform owns pour-quality checks. The
// flow gate (consecutive delta > threshold) and no-flow timeout are exposed as
// flags for a future coordinator; there is no blocking waitForFlow() here.
class ScalePlatform {
 public:
  static constexpr uint8_t kMaxFilterReads = 8;

  // May block briefly for HX711 init (wait_ready) — call from setup() only.
  void begin(const ScaleOps& ops);

  // One conversion attempt when the backend is ready; advances the FSM. Never
  // blocks. now_ms is the ControlTask clock (millis()) for flow-timeout timing.
  void tick(unsigned long now_ms);

  // Start a tare; completes over subsequent tick() calls (does not block).
  void tare();
  bool taring() const {
    return state_ == State::kTaring;
  }

  // Cached values from the last tick(); no HX711 I/O here (non-blocking).
  float readGrams() const {
    return lastGrams_;
  }
  float readFilteredGrams() const {
    return filteredGrams_;
  }

  // Flow gate for future pour steps. resetFlowDetect() arms the gate and starts
  // the timeout clock; flowDetected()/flowTimedOut() are advanced in tick().
  void resetFlowDetect(unsigned long now_ms);
  bool flowDetected() const {
    return flow_detected_;
  }
  bool flowTimedOut() const {
    return flow_timed_out_;
  }

  void setCalibrationFactor(float factor);
  void setFlowConfig(float thresholdG, int consecutive, unsigned long timeoutMs);

  bool ready() const {
    return initialized_ && !stale_;
  }
  float lastDeltaG() const {
    return lastDeltaG_;
  }
  unsigned long flowDetectTimeoutMs() const {
    return flowDetectTimeoutMs_;
  }

 private:
  enum class State : uint8_t { kSampling, kTaring };

  void pushFilterSample(float grams);
  void resetFilter();

  const ScaleOps* ops_ = nullptr;
  bool initialized_ = false;
  bool stale_ = false;
  unsigned long last_conv_ms_ = 0;
  State state_ = State::kSampling;

  float calibrationFactor_ = 0.0f;
  float flowThresholdG_ = 0.0f;
  int flowDetectConsecutive_ = 0;
  unsigned long flowDetectTimeoutMs_ = 0;

  float lastGrams_ = 0.0f;
  float lastSampleG_ = 0.0f;
  float lastDeltaG_ = 0.0f;
  bool have_prev_ = false;

  bool flow_active_ = false;
  bool flow_detected_ = false;
  bool flow_timed_out_ = false;
  int flowConsecutive_ = 0;
  unsigned long flow_reset_ms_ = 0;

  long tareSum_ = 0;
  uint8_t tareCount_ = 0;

  float filterRing_[kMaxFilterReads] = {};
  uint8_t filterSize_ = 0;
  uint8_t filterIndex_ = 0;
  float filterSum_ = 0.0f;
  float filteredGrams_ = 0.0f;
};
