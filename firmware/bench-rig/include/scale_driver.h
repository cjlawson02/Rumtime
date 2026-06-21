#pragma once

#include <Arduino.h>

class ScaleDriver {
 public:
  void begin();

  void tare();
  // Single bounded conversion; returns raw sample (use for mass_delta accounting).
  float readGrams();
  // Rolling average of recent readGrams() / flow samples.
  float readFilteredGrams();

  // Call once before polling isFlowDetected() during a pour.
  void resetFlowDetect();

  // Sample-to-sample delta vs flow threshold; increments consecutive counter.
  bool isFlowDetected();

  // Block until flow onset or timeout. Returns true and sets outDelayMs on success.
  bool waitForFlow(unsigned long* outDelayMs);

  void setCalibrationFactor(float factor);
  float calibrationFactor() const { return calibrationFactor_; }

  void setFlowConfig(float thresholdG, int consecutive,
                     unsigned long timeoutMs);
  float flowThresholdG() const { return flowThresholdG_; }
  int flowDetectConsecutive() const { return flowDetectConsecutive_; }
  unsigned long flowDetectTimeoutMs() const {
    return flowDetectTimeoutMs_;
  }

  // Last sample delta (g) — useful for weight-stream / vibration floor (Test 7.6).
  float lastDeltaG() const { return lastDeltaG_; }

  bool ready() const { return ready_; }

 private:
  bool readOnceWithTimeout(float* outGrams);
  void pushFilterSample(float grams);
  void resetFilter();

  float calibrationFactor_ = 0.0f;
  float flowThresholdG_ = 0.0f;
  int flowDetectConsecutive_ = 0;
  unsigned long flowDetectTimeoutMs_ = 0;

  float lastSampleG_ = 0.0f;
  float lastDeltaG_ = 0.0f;
  int flowConsecutive_ = 0;
  bool ready_ = false;

  float filterRing_[8] = {};
  uint8_t filterSize_ = 0;
  uint8_t filterIndex_ = 0;
  float filterSum_ = 0.0f;
  float filteredGrams_ = 0.0f;
};
