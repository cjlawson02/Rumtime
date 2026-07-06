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

bool SequenceRunner::start(const PourSequenceStep* steps, uint8_t step_count, unsigned long now_ms) {
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

  const CommandReject validated =
      validatePourSequenceSteps(steps, step_count, PumpBus::kNumChannels, *config_);
  if (validated != CommandReject::kNone) {
    last_reject_ = commandRejectToJobReject(validated);
    result_ = Coordinator::JobResult::kError;
    return false;
  }

  const CommandReject inventory_validated =
      validatePourSequenceInventory(steps, step_count, *inventory_);
  if (inventory_validated != CommandReject::kNone) {
    last_reject_ = commandRejectToJobReject(inventory_validated);
    result_ = Coordinator::JobResult::kError;
    return false;
  }

  if (pumps_->cutoffOpen()) {
    last_reject_ = JobReject::kCutoffOpen;
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

  if (pumps_ != nullptr && pumps_->cutoffOpen()) {
    if (coordinator_ != nullptr && coordinator_->busy()) {
      coordinator_->cancel();
    }
    finish(Coordinator::JobResult::kError, JobReject::kCutoffMidJob);
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

    if (inventory_ != nullptr) {
      inventory_->subtractMl(steps_[step_index_].ingredient_id, steps_[step_index_].ml);
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
