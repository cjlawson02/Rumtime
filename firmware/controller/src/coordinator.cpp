#include "coordinator.h"

#include <cmath>

#include "command_validate.h"
#include "config.h"
#include "config_store.h"
#include "pump_bus.h"
#include "scale_platform.h"

namespace {

unsigned long clampAntiDripMs(uint32_t anti_drip_ms) {
  return anti_drip_ms > kMaxAntiDripMs ? static_cast<unsigned long>(kMaxAntiDripMs)
                                       : static_cast<unsigned long>(anti_drip_ms);
}

}  // namespace

void Coordinator::begin(PumpBus& pumps, ScalePlatform& scale, ConfigStore& config) {
  pumps_ = &pumps;
  scale_ = &scale;
  config_ = &config;
  state_ = JobState::kIdle;
  phase_ = Phase::kIdle;
  result_ = JobResult::kNone;
  last_reject_ = JobReject::kNone;
}

void Coordinator::clearTerminalResult() {
  if (state_ != JobState::kIdle) {
    return;
  }
  result_ = JobResult::kNone;
  last_reject_ = JobReject::kNone;
}

bool Coordinator::startDispense(const DispenseCommand& command, unsigned long now_ms) {
  if (pumps_ == nullptr || scale_ == nullptr || config_ == nullptr) {
    return false;
  }
  if (state_ != JobState::kIdle) {
    last_reject_ = JobReject::kBusy;
    result_ = JobResult::kNone;
    return false;
  }
  if (command.channel >= PumpBus::kNumChannels) {
    last_reject_ = JobReject::kBadChannel;
    result_ = JobResult::kError;
    return false;
  }
  if (!validateDispenseCommand(command, PumpBus::kNumChannels, kMaxDispenseMl)) {
    last_reject_ = JobReject::kBadMl;
    result_ = JobResult::kError;
    return false;
  }

  const float ml_per_s = (command.ml_per_s > 0.0f && std::isfinite(command.ml_per_s))
                             ? command.ml_per_s
                             : config_->mlPerSecond(command.channel);
  unsigned long pour_ms = 0;
  CommandReject reject = CommandReject::kNone;
  if (!computePourDurationMs(command, PumpBus::kNumChannels, ml_per_s, &pour_ms, &reject)) {
    last_reject_ = commandRejectToJobReject(reject);
    result_ = JobResult::kError;
    return false;
  }
  if (command.flow_gate && !scale_->ready()) {
    last_reject_ = JobReject::kScaleNotReady;
    result_ = JobResult::kError;
    return false;
  }

  channel_ = command.channel;
  pour_ms_ = pour_ms;
  flow_gated_ = command.flow_gate;
  anti_drip_ms_ = clampAntiDripMs((command.ml_per_s > 0.0f && std::isfinite(command.ml_per_s))
                                      ? command.anti_drip_ms
                                      : config_->antiDripMs(command.channel));
  result_ = JobResult::kNone;
  last_reject_ = JobReject::kNone;

  const bool gated = command.flow_gate;

  if (gated) {
    scale_->resetFlowDetect(now_ms);
    flow_wait_start_ms_ = now_ms;
    flow_wait_max_ms_ = pour_ms_ < kFlowDetectTimeoutMs ? pour_ms_ : kFlowDetectTimeoutMs;
  }

  if (!pumps_->run(channel_, PumpDirection::kForward)) {
    last_reject_ = JobReject::kPumpRefused;
    finish(JobResult::kError);
    return false;
  }

  state_ = JobState::kDispensing;
  if (gated) {
    phase_ = Phase::kFlowWait;
  } else {
    beginPour(now_ms);
  }
  return true;
}

bool Coordinator::startPrime(uint8_t channel, unsigned long now_ms) {
  if (pumps_ == nullptr || config_ == nullptr) {
    return false;
  }
  if (state_ != JobState::kIdle) {
    last_reject_ = JobReject::kBusy;
    result_ = JobResult::kNone;
    return false;
  }
  if (channel >= PumpBus::kNumChannels) {
    last_reject_ = JobReject::kBadChannel;
    result_ = JobResult::kError;
    return false;
  }

  channel_ = channel;
  result_ = JobResult::kNone;
  last_reject_ = JobReject::kNone;
  prime_start_ms_ = now_ms;

  if (!pumps_->run(channel_, PumpDirection::kForward)) {
    last_reject_ = JobReject::kPumpRefused;
    finish(JobResult::kError);
    return false;
  }

  state_ = JobState::kPriming;
  phase_ = Phase::kPrime;
  return true;
}

void Coordinator::stopPrime() {
  if (state_ != JobState::kPriming || phase_ != Phase::kPrime) {
    return;
  }
  finish(JobResult::kOk);
}

void Coordinator::cancel() {
  if (state_ == JobState::kIdle) {
    return;
  }
  if (pumps_ != nullptr) {
    pumps_->stopAll();
  }
  state_ = JobState::kIdle;
  phase_ = Phase::kIdle;
  result_ = JobResult::kCancelled;
  last_reject_ = JobReject::kNone;
}

void Coordinator::tick(unsigned long now_ms) {
  if (state_ == JobState::kIdle) {
    return;
  }
  if (pumps_ == nullptr || scale_ == nullptr) {
    last_reject_ = JobReject::kScaleFault;
    finish(JobResult::kError);
    return;
  }

  if (state_ == JobState::kPriming) {
    if (phase_ == Phase::kPrime && (now_ms - prime_start_ms_) >= kMaxPrimeDurationMs) {
      last_reject_ = JobReject::kPrimeTimeout;
      finish(JobResult::kError);
    }
    return;
  }

  switch (phase_) {
    case Phase::kFlowWait:
      if (scale_->flowDetected()) {
        beginPour(now_ms);
      } else if (scale_->flowTimedOut() || !scale_->ready() ||
                 (now_ms - flow_wait_start_ms_) >= flow_wait_max_ms_) {
        last_reject_ = scale_->flowTimedOut() || (now_ms - flow_wait_start_ms_) >= flow_wait_max_ms_
                           ? JobReject::kFlowTimeout
                           : JobReject::kScaleFault;
        finish(JobResult::kError);
      }
      break;

    case Phase::kPour:
      if (flow_gated_ && !scale_->ready()) {
        last_reject_ = JobReject::kScaleFault;
        finish(JobResult::kError);
        break;
      }
      if ((now_ms - pour_start_ms_) >= pour_ms_) {
        beginAntiDrip(now_ms);
      }
      break;

    case Phase::kAntiDrip:
      if ((now_ms - anti_drip_start_ms_) >= anti_drip_ms_) {
        finish(JobResult::kOk);
      }
      break;

    case Phase::kIdle:
    default:
      break;
  }
}

void Coordinator::beginPour(unsigned long now_ms) {
  pour_start_ms_ = now_ms;
  phase_ = Phase::kPour;
}

void Coordinator::beginAntiDrip(unsigned long now_ms) {
  if (anti_drip_ms_ == 0) {
    finish(JobResult::kOk);
    return;
  }
  if (!pumps_->run(channel_, PumpDirection::kReverse)) {
    last_reject_ = JobReject::kPumpRefused;
    finish(JobResult::kError);
    return;
  }
  anti_drip_start_ms_ = now_ms;
  phase_ = Phase::kAntiDrip;
}

void Coordinator::finish(JobResult result) {
  if (pumps_ != nullptr) {
    pumps_->stopAll();
  }
  state_ = JobState::kIdle;
  phase_ = Phase::kIdle;
  result_ = result;
  if (result == JobResult::kOk) {
    last_reject_ = JobReject::kNone;
  }
}
