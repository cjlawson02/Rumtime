#include "scale_platform.h"

#include "config.h"

namespace {

uint8_t filterDepth() {
  return kScaleFilterReads < ScalePlatform::kMaxFilterReads ? kScaleFilterReads
                                                            : ScalePlatform::kMaxFilterReads;
}

}  // namespace

void ScalePlatform::resetFilter() {
  filterSize_ = 0;
  filterIndex_ = 0;
  filterSum_ = 0.0f;
  filteredGrams_ = 0.0f;
}

void ScalePlatform::pushFilterSample(float grams) {
  const uint8_t n = filterDepth();
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

void ScalePlatform::begin(const ScaleOps& ops) {
  ops_ = &ops;
  calibrationFactor_ = kScaleCalibrationFactor;
  flowThresholdG_ = kFlowThresholdG;
  flowDetectConsecutive_ = kFlowDetectConsecutive;
  flowDetectTimeoutMs_ = kFlowDetectTimeoutMs;

  state_ = State::kSampling;
  have_prev_ = false;
  flow_active_ = false;
  flow_detected_ = false;
  flow_timed_out_ = false;
  flowConsecutive_ = 0;
  lastGrams_ = 0.0f;
  lastSampleG_ = 0.0f;
  lastDeltaG_ = 0.0f;
  initialized_ = false;
  stale_ = false;
  last_conv_ms_ = 0;
  resetFilter();

  if (ops.begin == nullptr || ops.waitReady == nullptr || ops.isReady == nullptr ||
      ops.getUnits == nullptr || ops.readRaw == nullptr || ops.setScale == nullptr ||
      ops.setOffset == nullptr) {
    return;
  }

  ops_->begin(pins::kScaleDout, pins::kScaleSck);
  ops_->setScale(calibrationFactor_);
  // begin()/setup() is the only place a bounded HX711 wait is allowed (docs/16).
  initialized_ = ops_->waitReady(kScaleBeginTimeoutMs);
#if defined(ARDUINO)
  if (initialized_) {
    last_conv_ms_ = millis();
  }
#endif
}

void ScalePlatform::setCalibrationFactor(float factor) {
  calibrationFactor_ = factor;
  if (ops_ != nullptr) {
    ops_->setScale(calibrationFactor_);
  }
}

void ScalePlatform::setFlowConfig(float thresholdG, int consecutive, unsigned long timeoutMs) {
  flowThresholdG_ = thresholdG < 0.0f ? 0.0f : thresholdG;
  flowDetectConsecutive_ = consecutive < 1 ? 1 : consecutive;
  flowDetectTimeoutMs_ = timeoutMs;
}

void ScalePlatform::tare() {
  // Multi-tick: arm the tare and let tick() average kScaleFilterReads raw
  // samples; do not block ControlTask for N conversions here.
  state_ = State::kTaring;
  tareSum_ = 0;
  tareCount_ = 0;
}

void ScalePlatform::resetFlowDetect(unsigned long now_ms) {
  flow_active_ = true;
  flow_detected_ = false;
  flow_timed_out_ = false;
  flowConsecutive_ = 0;
  lastDeltaG_ = 0.0f;
  flow_reset_ms_ = now_ms;
  // The next sampled weight becomes the flow baseline (matches bench reset read).
  have_prev_ = false;
}

void ScalePlatform::tick(unsigned long now_ms) {
  stale_ = initialized_ && ((now_ms - last_conv_ms_) > kScaleStaleTimeoutMs);

  if (ops_ == nullptr || !initialized_) {
    if (flow_active_ && !flow_detected_ && (now_ms - flow_reset_ms_) >= flowDetectTimeoutMs_) {
      flow_timed_out_ = true;
      flow_active_ = false;
    }
    return;
  }
  // At most one conversion attempt per tick; skip silently when not ready.
  if (!ops_->isReady()) {
    if (flow_active_ && !flow_detected_ && (now_ms - flow_reset_ms_) >= flowDetectTimeoutMs_) {
      flow_timed_out_ = true;
      flow_active_ = false;
    }
    return;
  }

  if (state_ == State::kTaring) {
    tareSum_ += ops_->readRaw();
    ++tareCount_;
    last_conv_ms_ = now_ms;
    if (tareCount_ >= filterDepth()) {
      ops_->setOffset(tareSum_ / static_cast<long>(tareCount_));
      resetFilter();
      have_prev_ = false;
      lastSampleG_ = 0.0f;
      lastDeltaG_ = 0.0f;
      lastGrams_ = 0.0f;
      flowConsecutive_ = 0;
      state_ = State::kSampling;
    }
    return;
  }

  const float grams = ops_->getUnits();
  last_conv_ms_ = now_ms;
  lastGrams_ = grams;
  pushFilterSample(grams);

  if (!have_prev_) {
    lastDeltaG_ = 0.0f;
    have_prev_ = true;
  } else {
    lastDeltaG_ = grams - lastSampleG_;
  }
  lastSampleG_ = grams;

  if (flow_active_ && !flow_detected_) {
    if (lastDeltaG_ > flowThresholdG_) {
      ++flowConsecutive_;
    } else {
      flowConsecutive_ = 0;
    }
    if (flowConsecutive_ >= flowDetectConsecutive_) {
      flow_detected_ = true;
      flow_active_ = false;
    }
  }

  // Wall-clock flow timeout after detection attempt on this tick.
  if (flow_active_ && !flow_detected_ && (now_ms - flow_reset_ms_) >= flowDetectTimeoutMs_) {
    flow_timed_out_ = true;
    flow_active_ = false;
  }
}
