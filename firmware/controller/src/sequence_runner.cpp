#include "sequence_runner.h"

#include <cstring>

#include "command_validate.h"
#include "config_store.h"
#include "coordinator.h"
#include "inventory_store.h"
#include "pump_bus.h"
#include "scale_platform.h"

void SequenceRunner::begin(Coordinator& coordinator, ConfigStore& config, InventoryStore& inventory,
                           PumpBus& pumps, ScalePlatform& scale) {
  coordinator_ = &coordinator;
  config_ = &config;
  inventory_ = &inventory;
  pumps_ = &pumps;
  scale_ = &scale;
  state_ = State::kIdle;
  result_ = Coordinator::JobResult::kNone;
  last_reject_ = JobReject::kNone;
  phase_count_ = 0;
  phase_index_ = 0;
  phase_mode_ = PhaseMode::kNone;
  phase_in_progress_ = false;
  parallel_lane_count_ = 0;
  current_ingredient_[0] = '\0';
}

void SequenceRunner::clearTerminalResult() {
  if (state_ == State::kRunning) {
    return;
  }
  result_ = Coordinator::JobResult::kNone;
  last_reject_ = JobReject::kNone;
  phase_count_ = 0;
}

bool SequenceRunner::resolvePhases(const PourSequenceCommand& command) {
  if (config_ == nullptr) {
    return false;
  }
  if (command.phase_count == 0 || command.phase_count > kMaxPourPhases) {
    last_reject_ = JobReject::kBadMl;
    return false;
  }

  uint8_t total_steps = 0;
  for (uint8_t p = 0; p < command.phase_count; ++p) {
    const PourSequencePhase& in_phase = command.phases[p];
    if (in_phase.step_count == 0 || in_phase.step_count > kMaxConcurrentPumps) {
      last_reject_ = JobReject::kPumpRefused;
      return false;
    }
    total_steps = static_cast<uint8_t>(total_steps + in_phase.step_count);
    if (total_steps > kMaxPourSequenceSteps) {
      last_reject_ = JobReject::kBadMl;
      return false;
    }

    ResolvedPhase& out_phase = phases_[p];
    out_phase.step_count = in_phase.step_count;
    for (uint8_t s = 0; s < in_phase.step_count; ++s) {
      const PourSequenceStep& in = in_phase.steps[s];
      const int channel = config_->channelForIngredient(in.ingredient_id);
      if (channel < 0) {
        last_reject_ = JobReject::kUnboundIngredient;
        return false;
      }
      for (uint8_t prior = 0; prior < s; ++prior) {
        if (out_phase.steps[prior].channel == static_cast<uint8_t>(channel)) {
          last_reject_ = JobReject::kPumpRefused;
          return false;
        }
      }

      ResolvedStep& out = out_phase.steps[s];
      strncpy(out.ingredient_id, in.ingredient_id, kIngredientIdMax - 1);
      out.ingredient_id[kIngredientIdMax - 1] = '\0';
      out.ml = in.ml;
      out.channel = static_cast<uint8_t>(channel);
      out.ml_per_s = config_->mlPerSecond(out.channel);
      out.anti_drip_ms = config_->antiDripMs(out.channel);

      DispenseCommand cmd;
      cmd.channel = out.channel;
      cmd.ml = out.ml;
      cmd.flow_gate = false;
      unsigned long pour_ms = 0;
      CommandReject reject = CommandReject::kNone;
      if (!computePourDurationMs(cmd, PumpBus::kNumChannels, out.ml_per_s, &pour_ms, &reject)) {
        last_reject_ = commandRejectToJobReject(reject);
        return false;
      }
      out.pour_ms = static_cast<uint32_t>(pour_ms);
    }
  }
  phase_count_ = command.phase_count;
  return true;
}

bool SequenceRunner::start(const PourSequenceStep* steps, uint8_t step_count,
                           unsigned long now_ms) {
  PourSequenceCommand command = {};
  if (steps == nullptr || step_count == 0 || step_count > kMaxPourPhases) {
    last_reject_ = JobReject::kBadMl;
    result_ = Coordinator::JobResult::kError;
    return false;
  }
  for (uint8_t i = 0; i < step_count; ++i) {
    command.phases[i].steps[0] = steps[i];
    command.phases[i].step_count = 1;
  }
  command.phase_count = step_count;
  return start(command, now_ms);
}

bool SequenceRunner::start(const PourSequenceCommand& command, unsigned long now_ms) {
  if (state_ == State::kRunning) {
    last_reject_ = JobReject::kBusy;
    return false;
  }

  last_reject_ = JobReject::kNone;
  result_ = Coordinator::JobResult::kNone;

  if (coordinator_ == nullptr || config_ == nullptr || inventory_ == nullptr || pumps_ == nullptr ||
      scale_ == nullptr) {
    result_ = Coordinator::JobResult::kError;
    return false;
  }

  if (coordinator_->busy()) {
    last_reject_ = JobReject::kBusy;
    result_ = Coordinator::JobResult::kError;
    return false;
  }
  if (!scale_->ready()) {
    last_reject_ = JobReject::kScaleNotReady;
    result_ = Coordinator::JobResult::kError;
    return false;
  }
  if (!scale_->glassPresent()) {
    last_reject_ = JobReject::kNoGlass;
    result_ = Coordinator::JobResult::kError;
    return false;
  }

  if (!resolvePhases(command)) {
    result_ = Coordinator::JobResult::kError;
    return false;
  }

  phase_index_ = 0;
  phase_in_progress_ = false;
  phase_mode_ = PhaseMode::kNone;
  state_ = State::kRunning;
  current_ingredient_[0] = '\0';

  if (!startCurrentPhase(now_ms)) {
    finish(Coordinator::JobResult::kError, last_reject_);
    return false;
  }
  return true;
}

bool SequenceRunner::startCurrentPhase(unsigned long now_ms) {
  if (phase_index_ >= phase_count_) {
    return false;
  }

  const ResolvedPhase& phase = phases_[phase_index_];
  if (phase.step_count == 1) {
    const ResolvedStep& step = phase.steps[0];
    DispenseCommand cmd;
    cmd.channel = step.channel;
    cmd.ml = step.ml;
    cmd.flow_gate = true;
    cmd.ml_per_s = step.ml_per_s;
    cmd.anti_drip_ms = step.anti_drip_ms;

    strncpy(current_ingredient_, step.ingredient_id, kIngredientIdMax - 1);
    current_ingredient_[kIngredientIdMax - 1] = '\0';

    if (!coordinator_->startDispense(cmd, now_ms)) {
      last_reject_ = coordinator_->lastReject();
      return false;
    }
    phase_mode_ = PhaseMode::kSoloCoordinator;
    phase_in_progress_ = true;
    return true;
  }

  return startParallelPhase(now_ms);
}

bool SequenceRunner::startParallelPhase(unsigned long now_ms) {
  const ResolvedPhase& phase = phases_[phase_index_];
  if (phase.step_count > pumps_->maxConcurrent()) {
    last_reject_ = JobReject::kPumpRefused;
    return false;
  }

  strncpy(current_ingredient_, phase.steps[0].ingredient_id, kIngredientIdMax - 1);
  current_ingredient_[kIngredientIdMax - 1] = '\0';

  parallel_lane_count_ = phase.step_count;
  for (uint8_t i = 0; i < phase.step_count; ++i) {
    const ResolvedStep& step = phase.steps[i];
    if (!pumps_->run(step.channel, PumpDirection::kForward)) {
      last_reject_ = JobReject::kPumpRefused;
      pumps_->stopAll();
      return false;
    }
    parallel_lanes_[i].state = ParallelLaneState::kPouring;
    parallel_lanes_[i].step_index = i;
    parallel_lanes_[i].segment_start_ms = now_ms;
  }

  phase_mode_ = PhaseMode::kParallel;
  phase_in_progress_ = true;
  return true;
}

void SequenceRunner::tickParallel(unsigned long now_ms) {
  const ResolvedPhase& phase = phases_[phase_index_];
  bool any_active = false;

  for (uint8_t i = 0; i < parallel_lane_count_; ++i) {
    ParallelLane& lane = parallel_lanes_[i];
    if (lane.state == ParallelLaneState::kDone) {
      continue;
    }
    any_active = true;
    const ResolvedStep& step = phase.steps[lane.step_index];

    if (lane.state == ParallelLaneState::kPouring) {
      if ((now_ms - lane.segment_start_ms) < step.pour_ms) {
        continue;
      }
      if (step.anti_drip_ms == 0) {
        pumps_->stop(step.channel);
        lane.state = ParallelLaneState::kDone;
        continue;
      }
      if (!pumps_->run(step.channel, PumpDirection::kReverse)) {
        last_reject_ = JobReject::kPumpRefused;
        finish(Coordinator::JobResult::kError, last_reject_);
        return;
      }
      lane.state = ParallelLaneState::kAntiDrip;
      lane.segment_start_ms = now_ms;
      continue;
    }

    if (lane.state == ParallelLaneState::kAntiDrip) {
      if ((now_ms - lane.segment_start_ms) >= step.anti_drip_ms) {
        pumps_->stop(step.channel);
        lane.state = ParallelLaneState::kDone;
      }
    }
  }

  if (any_active) {
    for (uint8_t i = 0; i < parallel_lane_count_; ++i) {
      if (parallel_lanes_[i].state != ParallelLaneState::kDone) {
        return;
      }
    }
  }

  if (!advanceAfterPhaseSuccess(now_ms)) {
    if (coordinator_ != nullptr && coordinator_->busy()) {
      coordinator_->cancel();
    }
    finish(Coordinator::JobResult::kError, last_reject_);
  }
}

bool SequenceRunner::advanceAfterPhaseSuccess(unsigned long now_ms) {
  const ResolvedPhase& phase = phases_[phase_index_];
  for (uint8_t s = 0; s < phase.step_count; ++s) {
    if (inventory_ != nullptr &&
        !inventory_->subtractMl(phase.steps[s].ingredient_id, phase.steps[s].ml)) {
      last_reject_ = JobReject::kBadMl;
      return false;
    }
  }

  phase_in_progress_ = false;
  phase_mode_ = PhaseMode::kNone;
  ++phase_index_;

  if (phase_index_ >= phase_count_) {
    finish(Coordinator::JobResult::kOk);
    return true;
  }

  if (!startCurrentPhase(now_ms)) {
    return false;
  }
  return true;
}

void SequenceRunner::cancel() {
  if (state_ != State::kRunning) {
    return;
  }
  if (coordinator_ != nullptr) {
    coordinator_->cancel();
  }
  if (pumps_ != nullptr) {
    pumps_->stopAll();
  }
  finish(Coordinator::JobResult::kCancelled, JobReject::kNone);
}

void SequenceRunner::tick(unsigned long now_ms) {
  if (state_ != State::kRunning) {
    return;
  }

  if (!phase_in_progress_) {
    return;
  }

  if (phase_mode_ == PhaseMode::kParallel) {
    tickParallel(now_ms);
    return;
  }

  if (coordinator_ == nullptr) {
    finish(Coordinator::JobResult::kError);
    return;
  }

  if (coordinator_->cancelled()) {
    finish(Coordinator::JobResult::kCancelled, JobReject::kNone);
    return;
  }

  if (!coordinator_->busy()) {
    if (coordinator_->error()) {
      finish(Coordinator::JobResult::kError, coordinator_->lastReject());
      return;
    }
    if (!coordinator_->ok()) {
      finish(Coordinator::JobResult::kError);
      return;
    }

    if (!advanceAfterPhaseSuccess(now_ms)) {
      if (coordinator_->busy()) {
        coordinator_->cancel();
      }
      finish(Coordinator::JobResult::kError, last_reject_);
    }
  }
}

void SequenceRunner::finish(Coordinator::JobResult result, JobReject reject) {
  if (pumps_ != nullptr && result != Coordinator::JobResult::kOk) {
    pumps_->stopAll();
  }
  state_ = State::kIdle;
  result_ = result;
  if (result == Coordinator::JobResult::kCancelled) {
    last_reject_ = JobReject::kNone;
  } else if (reject != JobReject::kNone) {
    last_reject_ = reject;
  } else if (result == Coordinator::JobResult::kOk) {
    last_reject_ = JobReject::kNone;
  }
  phase_index_ = 0;
  phase_in_progress_ = false;
  phase_mode_ = PhaseMode::kNone;
  parallel_lane_count_ = 0;
  current_ingredient_[0] = '\0';
  if (result != Coordinator::JobResult::kOk) {
    phase_count_ = 0;
  }
}

const char* SequenceRunner::stepIngredient(uint8_t index) const {
  if (index >= phase_count_ || phases_[index].step_count == 0) {
    return "";
  }
  return phases_[index].steps[0].ingredient_id;
}

float SequenceRunner::stepMl(uint8_t index) const {
  if (index >= phase_count_ || phases_[index].step_count == 0) {
    return 0.0f;
  }
  return phases_[index].steps[0].ml;
}

uint32_t SequenceRunner::stepDurationMs(const ResolvedStep& step) {
  return step.pour_ms + step.anti_drip_ms;
}

uint32_t SequenceRunner::phaseDurationMs(const ResolvedPhase& phase) {
  uint32_t max_ms = 0;
  for (uint8_t i = 0; i < phase.step_count; ++i) {
    const uint32_t d = stepDurationMs(phase.steps[i]);
    if (d > max_ms) {
      max_ms = d;
    }
  }
  return max_ms;
}

uint8_t SequenceRunner::progressPercent(uint8_t in_step_progress) const {
  if (state_ != State::kRunning || phase_count_ == 0) {
    return 0;
  }

  uint32_t total_ms = 0;
  uint32_t done_ms = 0;
  for (uint8_t i = 0; i < phase_count_; ++i) {
    const uint32_t d = phaseDurationMs(phases_[i]);
    total_ms += d;
    if (i < phase_index_) {
      done_ms += d;
    }
  }

  if (total_ms == 0) {
    const int step_pct = in_step_progress > 100 ? 100 : static_cast<int>(in_step_progress);
    const int pct =
        (static_cast<int>(phase_index_) * 100 + step_pct) / static_cast<int>(phase_count_);
    return static_cast<uint8_t>(pct < 0 ? 0 : (pct > 100 ? 100 : pct));
  }

  const uint8_t step_pct = in_step_progress > 100 ? 100 : in_step_progress;
  const uint32_t current_ms =
      phase_index_ < phase_count_
          ? (phaseDurationMs(phases_[phase_index_]) * static_cast<uint32_t>(step_pct)) / 100UL
          : 0UL;
  const uint32_t elapsed = done_ms + current_ms;
  const uint32_t pct = (elapsed * 100UL) / total_ms;
  return static_cast<uint8_t>(pct > 100UL ? 100UL : pct);
}
