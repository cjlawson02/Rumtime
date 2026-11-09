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

// Multi-phase pour runner (docs/16). Owned by ControlTask; advances non-blocking
// each tick. Phases run in order. Steps within a phase run concurrently (open-loop
// timed). A single-step phase uses the coordinator's flow-gated dispense FSM.
class SequenceRunner {
 public:
  enum class State : uint8_t { kIdle, kRunning };

  void begin(Coordinator& coordinator, ConfigStore& config, InventoryStore& inventory,
             PumpBus& pumps, ScalePlatform& scale);

  // Preflight all phases, then start phase 0. Returns false without motion when
  // busy, unbound ingredient, bad ml, concurrency violation, or pour-ceiling.
  bool start(const PourSequenceCommand& command, unsigned long now_ms);

  // Convenience: each flat step becomes its own sequential phase (legacy tests).
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
  // 0-based index of the phase currently pouring; only meaningful while busy().
  uint8_t stepIndex() const {
    return phase_index_;
  }
  uint8_t stepCount() const {
    return phase_count_;
  }
  const char* stepIngredient(uint8_t index) const;
  float stepMl(uint8_t index) const;
  const char* currentIngredient() const {
    return current_ingredient_;
  }

  // Overall pour progress 0–100 weighted by each phase's wall duration.
  // in_step_progress is the active phase's 0–100 (from Coordinator when solo).
  uint8_t progressPercent(uint8_t in_step_progress) const;

  void clearTerminalResult();

 private:
  enum class PhaseMode : uint8_t { kNone, kSoloCoordinator, kParallel };

  enum class ParallelLaneState : uint8_t { kIdle, kPouring, kAntiDrip, kDone };

  struct ResolvedStep {
    char ingredient_id[kIngredientIdMax] = {0};
    float ml = 0.0f;
    uint8_t channel = 0;
    float ml_per_s = 0.0f;
    uint32_t anti_drip_ms = 0;
    uint32_t pour_ms = 0;
  };

  struct ResolvedPhase {
    ResolvedStep steps[kMaxConcurrentPumps] = {};
    uint8_t step_count = 0;
  };

  struct ParallelLane {
    ParallelLaneState state = ParallelLaneState::kIdle;
    uint8_t step_index = 0;
    unsigned long segment_start_ms = 0;
  };

  static uint32_t stepDurationMs(const ResolvedStep& step);
  static uint32_t phaseDurationMs(const ResolvedPhase& phase);
  bool resolvePhases(const PourSequenceCommand& command);
  bool startCurrentPhase(unsigned long now_ms);
  bool startParallelPhase(unsigned long now_ms);
  void tickParallel(unsigned long now_ms);
  bool advanceAfterPhaseSuccess(unsigned long now_ms);
  void finish(Coordinator::JobResult result, JobReject reject = JobReject::kNone);

  Coordinator* coordinator_ = nullptr;
  ConfigStore* config_ = nullptr;
  InventoryStore* inventory_ = nullptr;
  PumpBus* pumps_ = nullptr;
  ScalePlatform* scale_ = nullptr;

  State state_ = State::kIdle;
  Coordinator::JobResult result_ = Coordinator::JobResult::kNone;
  JobReject last_reject_ = JobReject::kNone;

  ResolvedPhase phases_[kMaxPourPhases] = {};
  uint8_t phase_count_ = 0;
  uint8_t phase_index_ = 0;
  PhaseMode phase_mode_ = PhaseMode::kNone;
  bool phase_in_progress_ = false;

  ParallelLane parallel_lanes_[kMaxConcurrentPumps] = {};
  uint8_t parallel_lane_count_ = 0;

  char current_ingredient_[kIngredientIdMax] = {};
};
