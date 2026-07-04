#include "coordinator.h"

#include <cmath>

#include "command_validate.h"
#include "config.h"
#include "pump_bus.h"
#include "scale_platform.h"

void Coordinator::begin(PumpBus& pumps, ScalePlatform& scale) {
  pumps_ = &pumps;
  scale_ = &scale;
  state_ = JobState::kIdle;
  phase_ = Phase::kIdle;
  result_ = JobResult::kNone;
  last_reject_ = JobReject::kNone;
}

bool Coordinator::startDispense(const DispenseCommand& command, unsigned long now_ms) {
  if (pumps_ == nullptr || scale_ == nullptr) {
    return false;
  }
  // Reject when busy so a duplicate dispense does not disturb the running job.
  if (state_ != JobState::kIdle) {
    last_reject_ = JobReject::kBusy;
    return false;
  }
  // Preconditions: cutoff closed and valid channel.
  if (pumps_->cutoffOpen()) {
    last_reject_ = JobReject::kCutoffOpen;
    result_ = JobResult::kError;
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
  const float pour_ms_f = (command.ml / kDefaultMlPerSecond) * 1000.0f;
  if (!std::isfinite(pour_ms_f) || pour_ms_f > static_cast<float>(kMaxPourDurationMs)) {
    last_reject_ = JobReject::kPourTooLong;
    result_ = JobResult::kError;
    return false;
  }

  channel_ = command.channel;
  pour_ms_ = static_cast<unsigned long>(pour_ms_f);
  if (pour_ms_ == 0) {
    // Sub-resolution volume: a 0 ms pour would jump straight to anti-drip and
    // only suck back. Reject instead of dispensing a net-negative pour.
    last_reject_ = JobReject::kSubResolutionMl;
    result_ = JobResult::kError;
    return false;
  }
  result_ = JobResult::kNone;
  last_reject_ = JobReject::kNone;

  // Flow-gate path only when requested AND the scale is ready; otherwise fall
  // back to a timed pour from motor-on (docs/16 dispense step fallback).
  const bool gated = command.flow_gate && scale_->ready();

  if (!pumps_->run(channel_, PumpDirection::kForward)) {
    // Cutoff opened between the check and run(), or bus refused for safety.
    last_reject_ = JobReject::kPumpRefused;
    finish(JobResult::kError);
    return false;
  }

  state_ = JobState::kDispensing;
  if (gated) {
    scale_->resetFlowDetect(now_ms);
    phase_ = Phase::kFlowWait;
  } else {
    beginPour(now_ms);
  }
  return true;
}

void Coordinator::cancel() {
  if (state_ == JobState::kIdle) {
    return;
  }
  // Immediate abort: stop motion, clear job, no success flag, no anti-drip.
  if (pumps_ != nullptr) {
    pumps_->stopAll();
  }
  state_ = JobState::kIdle;
  phase_ = Phase::kIdle;
  result_ = JobResult::kNone;
  last_reject_ = JobReject::kNone;
}

void Coordinator::tick(unsigned long now_ms) {
  if (state_ == JobState::kIdle) {
    return;
  }
  // Cutoff opening mid-job is a hard abort (PumpBus::tick() already stopped the
  // motor this tick; reflect it in the job result).
  if (pumps_ == nullptr || scale_ == nullptr || pumps_->cutoffOpen()) {
    last_reject_ = JobReject::kCutoffMidJob;
    finish(JobResult::kError);
    return;
  }

  switch (phase_) {
    case Phase::kFlowWait:
      if (scale_->flowDetected()) {
        beginPour(now_ms);  // pour timer starts at flow onset (matches bench rig)
      } else if (scale_->flowTimedOut() || !scale_->ready()) {
        // No-flow timeout, or the scale went not-ready during the wait -> abort.
        last_reject_ = scale_->flowTimedOut() ? JobReject::kFlowTimeout : JobReject::kScaleFault;
        finish(JobResult::kError);
      }
      break;

    case Phase::kPour:
      if ((now_ms - pour_start_ms_) >= pour_ms_) {
        beginAntiDrip(now_ms);
      }
      break;

    case Phase::kAntiDrip:
      if ((now_ms - anti_drip_start_ms_) >= kDefaultAntiDripMs) {
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
  if (kDefaultAntiDripMs == 0) {
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
