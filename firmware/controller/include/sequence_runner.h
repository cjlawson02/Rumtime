#pragma once

#include <cstdint>

#include "command_queue.h"
#include "config.h"
#include "coordinator.h"
#include "status_snapshot.h"

class ConfigStore;
class InventoryStore;
class PumpBus;
class ScalePlatform;

// Sequential multi-step pour runner (docs/16 phase 4). Owned by ControlTask;
// advances non-blocking each tick. Each step resolves ingredient_id -> pump via
// ConfigStore and runs through the coordinator's flow-gated dispense FSM.
// Parallel groups are deferred.
class SequenceRunner {
 public:
  enum class State : uint8_t { kIdle, kRunning };

  void begin(Coordinator& coordinator, ConfigStore& config, InventoryStore& inventory,
             PumpBus& pumps, ScalePlatform& scale);

  // Preflight all steps, then start step 0. Returns false without motion when
  // busy, cutoff open, unbound ingredient, bad ml, or pour-ceiling violation.
  bool start(const PourSequenceStep* steps, uint8_t step_count, unsigned long now_ms);

  // Abort the sequence immediately (coordinator cancel + stopAll). Safe when idle.
  void cancel();

  // Advance the sequence after coordinator.tick(). Non-blocking.
  void tick(unsigned long now_ms);

  bool busy() const {
    return state_ == State::kRunning;
  }
  Coordinator::JobResult result() const {
    return result_;
  }
  bool ok() const {
    return result_ == Coordinator::JobResult::kOk;
  }
  bool error() const {
    return result_ == Coordinator::JobResult::kError;
  }
  bool cancelled() const {
    return result_ == Coordinator::JobResult::kCancelled;
  }
  JobReject lastReject() const {
    return last_reject_;
  }
  // 0-based index of the step currently pouring; only meaningful while busy().
  uint8_t stepIndex() const {
    return step_index_;
  }
  uint8_t stepCount() const {
    return step_count_;
  }
  const char* stepIngredient(uint8_t index) const;
  float stepMl(uint8_t index) const;
  const char* currentIngredient() const {
    return current_ingredient_;
  }

  // Clear terminal result after a completed sequence so a later coordinator job
  // is not shadowed in the status snapshot (ControlTask calls on dispense/prime).
  void clearTerminalResult();

 private:
  struct ResolvedStep {
    char ingredient_id[kIngredientIdMax] = {0};
    float ml = 0.0f;
    uint8_t channel = 0;
    float ml_per_s = 0.0f;
    uint32_t anti_drip_ms = 0;
  };

  bool resolveSteps(const PourSequenceStep* steps, uint8_t step_count);
  bool startCurrentStep(unsigned long now_ms);
  void finish(Coordinator::JobResult result, JobReject reject = JobReject::kNone);

  Coordinator* coordinator_ = nullptr;
  ConfigStore* config_ = nullptr;
  InventoryStore* inventory_ = nullptr;
  PumpBus* pumps_ = nullptr;
  ScalePlatform* scale_ = nullptr;

  State state_ = State::kIdle;
  Coordinator::JobResult result_ = Coordinator::JobResult::kNone;
  JobReject last_reject_ = JobReject::kNone;

  ResolvedStep steps_[kMaxPourSequenceSteps] = {};
  uint8_t step_count_ = 0;
  uint8_t step_index_ = 0;
  char current_ingredient_[kIngredientIdMax] = {};
  bool step_in_progress_ = false;
};
