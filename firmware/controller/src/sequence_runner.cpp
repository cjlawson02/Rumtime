#include "sequence_runner.h"

#include <cstring>

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
  step_count_ = 0;
  step_index_ = 0;
  current_ingredient_[0] = '\0';
  step_in_progress_ = false;
}

void SequenceRunner::clearTerminalResult() {
  if (state_ == State::kRunning) {
    return;
  }
  result_ = Coordinator::JobResult::kNone;
  last_reject_ = JobReject::kNone;
  step_count_ = 0;
}

bool SequenceRunner::resolveSteps(const PourSequenceStep* steps, uint8_t step_count) {
  if (config_ == nullptr) {
    return false;
  }
  for (uint8_t i = 0; i < step_count; ++i) {
    const PourSequenceStep& in = steps[i];
    const int channel = config_->channelForIngredient(in.ingredient_id);
    if (channel < 0) {
      last_reject_ = JobReject::kUnboundIngredient;
      return false;
    }
    ResolvedStep& out = steps_[i];
    strncpy(out.ingredient_id, in.ingredient_id, kIngredientIdMax - 1);
    out.ingredient_id[kIngredientIdMax - 1] = '\0';
    out.ml = in.ml;
    out.channel = static_cast<uint8_t>(channel);
    out.ml_per_s = config_->mlPerSecond(out.channel);
    out.anti_drip_ms = config_->antiDripMs(out.channel);
  }
  return true;
}

bool SequenceRunner::start(const PourSequenceStep* steps, uint8_t step_count,
                           unsigned long now_ms) {
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

  if (!resolveSteps(steps, step_count)) {
    result_ = Coordinator::JobResult::kError;
    return false;
  }

  step_count_ = step_count;
  step_index_ = 0;
  step_in_progress_ = false;
  state_ = State::kRunning;
  current_ingredient_[0] = '\0';

  if (!startCurrentStep(now_ms)) {
    finish(Coordinator::JobResult::kError, last_reject_);
    return false;
  }
  return true;
}

bool SequenceRunner::startCurrentStep(unsigned long now_ms) {
  if (step_index_ >= step_count_) {
    return false;
  }

  const ResolvedStep& step = steps_[step_index_];

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

  step_in_progress_ = true;
  return true;
}

void SequenceRunner::cancel() {
  if (state_ != State::kRunning) {
    return;
  }
  if (coordinator_ != nullptr) {
    coordinator_->cancel();
  }
  finish(Coordinator::JobResult::kCancelled, JobReject::kNone);
}

void SequenceRunner::tick(unsigned long now_ms) {
  (void)now_ms;
  if (state_ != State::kRunning) {
    return;
  }

  if (!step_in_progress_) {
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

    if (inventory_ != nullptr &&
        !inventory_->subtractMl(steps_[step_index_].ingredient_id, steps_[step_index_].ml)) {
      finish(Coordinator::JobResult::kError, JobReject::kBadMl);
      return;
    }

    step_in_progress_ = false;
    ++step_index_;

    if (step_index_ >= step_count_) {
      finish(Coordinator::JobResult::kOk);
      return;
    }

    if (!startCurrentStep(now_ms)) {
      if (coordinator_ != nullptr && coordinator_->busy()) {
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
  step_index_ = 0;
  step_in_progress_ = false;
  current_ingredient_[0] = '\0';
  if (result != Coordinator::JobResult::kOk) {
    step_count_ = 0;
  }
}

const char* SequenceRunner::stepIngredient(uint8_t index) const {
  if (index >= step_count_) {
    return "";
  }
  return steps_[index].ingredient_id;
}

float SequenceRunner::stepMl(uint8_t index) const {
  if (index >= step_count_) {
    return 0.0f;
  }
  return steps_[index].ml;
}

uint32_t SequenceRunner::stepDurationMs(const ResolvedStep& step) {
  if (step.ml_per_s <= 0.0f || step.ml <= 0.0f) {
    return step.anti_drip_ms;
  }
  const float pour_ms = (step.ml / step.ml_per_s) * 1000.0f;
  if (pour_ms <= 0.0f) {
    return step.anti_drip_ms;
  }
  return static_cast<uint32_t>(pour_ms) + step.anti_drip_ms;
}

uint8_t SequenceRunner::progressPercent(uint8_t in_step_progress) const {
  if (state_ != State::kRunning || step_count_ == 0) {
    return 0;
  }

  uint32_t total_ms = 0;
  uint32_t done_ms = 0;
  for (uint8_t i = 0; i < step_count_; ++i) {
    const uint32_t d = stepDurationMs(steps_[i]);
    total_ms += d;
    if (i < step_index_) {
      done_ms += d;
    }
  }

  if (total_ms == 0) {
    // Equal step weight when calibration is missing/zero.
    const int step_pct = in_step_progress > 100 ? 100 : static_cast<int>(in_step_progress);
    const int pct =
        (static_cast<int>(step_index_) * 100 + step_pct) / static_cast<int>(step_count_);
    return static_cast<uint8_t>(pct < 0 ? 0 : (pct > 100 ? 100 : pct));
  }

  const uint8_t step_pct = in_step_progress > 100 ? 100 : in_step_progress;
  const uint32_t current_ms =
      step_index_ < step_count_
          ? (stepDurationMs(steps_[step_index_]) * static_cast<uint32_t>(step_pct)) / 100UL
          : 0UL;
  const uint32_t elapsed = done_ms + current_ms;
  const uint32_t pct = (elapsed * 100UL) / total_ms;
  return static_cast<uint8_t>(pct > 100UL ? 100UL : pct);
}
