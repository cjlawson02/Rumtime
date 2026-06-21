#include "scale_driver.h"

#include "config.h"

#include <HX711.h>

namespace {

HX711 scale;

}  // namespace

void ScaleDriver::resetFilter() {
  filterSize_ = 0;
  filterIndex_ = 0;
  filterSum_ = 0.0f;
  filteredGrams_ = 0.0f;
}

bool ScaleDriver::readOnceWithTimeout(float* outGrams) {
  if (!ready_ || outGrams == nullptr) {
    return false;
  }
  if (!scale.is_ready()) {
    if (!scale.wait_ready_timeout(kScaleReadTimeoutMs)) {
      ready_ = false;
      return false;
    }
  }
  *outGrams = scale.get_units(1);
  return true;
}

void ScaleDriver::pushFilterSample(float grams) {
  const uint8_t n = kScaleFilterReads;
  if (filterSize_ < n) {
    filterRing_[filterSize_] = grams;
    filterSum_ += grams;
    ++filterSize_;
    filteredGrams_ = filterSum_ / static_cast<float>(filterSize_);
  } else {
    filterSum_ -= filterRing_[filterIndex_];
    filterRing_[filterIndex_] = grams;
    filterSum_ += grams;
    filterIndex_ = static_cast<uint8_t>((filterIndex_ + 1) % n);
    filteredGrams_ = filterSum_ / static_cast<float>(n);
  }
}

void ScaleDriver::begin() {
  calibrationFactor_ = kScaleCalibrationFactor;
  flowThresholdG_ = kFlowThresholdG;
  flowDetectConsecutive_ = kFlowDetectConsecutive;
  flowDetectTimeoutMs_ = kFlowDetectTimeoutMs;

  scale.begin(pins::kScaleDout, pins::kScaleSck);
  scale.set_scale(calibrationFactor_);
  resetFilter();
  ready_ = scale.wait_ready_timeout(2000);
}

void ScaleDriver::setCalibrationFactor(float factor) {
  calibrationFactor_ = factor;
  scale.set_scale(calibrationFactor_);
}

void ScaleDriver::setFlowConfig(float thresholdG, int consecutive,
                                unsigned long timeoutMs) {
  flowThresholdG_ = thresholdG;
  flowDetectConsecutive_ = consecutive;
  flowDetectTimeoutMs_ = timeoutMs;
}

void ScaleDriver::tare() {
  if (!ready_) {
    ready_ = scale.wait_ready_timeout(2000);
  }
  if (!ready_) {
    return;
  }

  long sum = 0;
  uint8_t count = 0;
  for (uint8_t i = 0; i < kScaleFilterReads; ++i) {
    if (!scale.wait_ready_timeout(kScaleReadTimeoutMs)) {
      ready_ = false;
      return;
    }
    sum += scale.read();
    ++count;
  }
  if (count == 0) {
    ready_ = false;
    return;
  }

  scale.set_offset(sum / static_cast<long>(count));
  resetFilter();
  lastSampleG_ = 0.0f;
  lastDeltaG_ = 0.0f;
  flowConsecutive_ = 0;

  float sample = 0.0f;
  if (readOnceWithTimeout(&sample)) {
    pushFilterSample(sample);
  }
}

float ScaleDriver::readGrams() {
  float sample = 0.0f;
  if (!readOnceWithTimeout(&sample)) {
    return filteredGrams_;
  }
  pushFilterSample(sample);
  return sample;
}

float ScaleDriver::readFilteredGrams() {
  float sample = 0.0f;
  if (!readOnceWithTimeout(&sample)) {
    return filteredGrams_;
  }
  pushFilterSample(sample);
  return filteredGrams_;
}

void ScaleDriver::resetFlowDetect() {
  flowConsecutive_ = 0;
  lastDeltaG_ = 0.0f;
  float weight = 0.0f;
  if (readOnceWithTimeout(&weight)) {
    lastSampleG_ = weight;
  } else {
    lastSampleG_ = filteredGrams_;
  }
}

bool ScaleDriver::isFlowDetected() {
  float weight = 0.0f;
  if (!readOnceWithTimeout(&weight)) {
    return false;
  }

  lastDeltaG_ = weight - lastSampleG_;
  lastSampleG_ = weight;
  pushFilterSample(weight);

  if (lastDeltaG_ > flowThresholdG_) {
    ++flowConsecutive_;
  } else {
    flowConsecutive_ = 0;
  }
  return flowConsecutive_ >= flowDetectConsecutive_;
}

bool ScaleDriver::waitForFlow(unsigned long* outDelayMs) {
  resetFlowDetect();
  const unsigned long start = millis();

  while (millis() - start < flowDetectTimeoutMs_) {
    if (isFlowDetected()) {
      if (outDelayMs != nullptr) {
        *outDelayMs = millis() - start;
      }
      return true;
    }
    delay(kFlowSampleIntervalMs);
  }

  if (outDelayMs != nullptr) {
    *outDelayMs = millis() - start;
  }
  return false;
}
