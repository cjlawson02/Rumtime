#pragma once

#include <atomic>
#include <cstdint>

#include "config.h"

// Post-dequeue / runtime job reject reason (uint8_t for serial printing).
enum class JobReject : uint8_t {
  kNone = 0,
  kBusy,
  kBadChannel,
  kBadMl,
  kPourTooLong,
  kSubResolutionMl,
  kPumpRefused,
  kFlowTimeout,
  kScaleFault,
  kScaleNotReady,
  kPrimeTimeout,
  kUnboundIngredient,
  kBadCalibration,
};

// Brief terminal recipe job state for GET /status (kiosk pour-page).
enum class JobTerminalState : uint8_t { kNone = 0, kComplete = 1, kCancelled = 2, kError = 3 };

// Published binding/pump rows — copied from ConfigStore/InventoryStore on ControlTask only.
struct SnapshotBinding {
  char ingredient_id[kIngredientIdMax] = {0};
  float remaining_ml = 0.0f;
  float bottle_size_ml = 0.0f;
  bool primed = false;
};

struct SnapshotPump {
  uint8_t pump_id = 0;  // 1-based
  char ingredient_id[kIngredientIdMax] = {0};
  float ml_per_second = 0.0f;
  uint32_t anti_drip_ms = 0;
  bool bound = false;
};

// Status snapshot (docs/16). Single writer (ControlTask), tear-free read for
// HTTP via seqlock publish/read in StatusPublisher.
struct StatusSnapshot {
  bool pumps_running = false;
  bool scale_ready = false;
  float grams = 0.0f;  // filtered
  bool flow_detected = false;
  bool flow_timed_out = false;
  float last_delta_g = 0.0f;

  bool job_busy = false;
  bool command_pending = false;
  bool config_op_pending = false;
  bool job_ok = false;
  bool job_error = false;
  bool job_cancelled = false;
  uint8_t job_phase = 0;
  JobReject job_reject = JobReject::kNone;

  bool config_dirty = false;
  bool config_persist_error = false;
  bool config_op_apply_failed = false;

  bool sequence_busy = false;
  uint8_t sequence_step_index = 0;
  uint8_t sequence_step_count = 0;
  uint8_t sequence_step_progress = 0;  // 0–100 within the current step
  uint8_t sequence_progress = 0;       // 0–100 overall, weighted by step duration
  char sequence_ingredient[kIngredientIdMax] = {0};
  char active_recipe_id[kRecipeIdMax] = {0};

  JobTerminalState job_terminal = JobTerminalState::kNone;
  char terminal_recipe_id[kRecipeIdMax] = {0};

  uint8_t pump_job_pump_id = 0;
  uint8_t pump_job_purpose = 0;
  unsigned long pump_job_start_ms = 0;
  float pump_job_target_ml = 0.0f;
  unsigned long pump_job_duration_ms = 0;

  SnapshotBinding published_bindings[kMaxInventoryEntries] = {};
  uint8_t published_binding_count = 0;
  SnapshotPump published_pumps[kMaxPumps] = {};
  uint8_t published_pump_count = 0;
};

class StatusPublisher {
 public:
  void begin();
  void publish(const StatusSnapshot& snapshot);
  StatusSnapshot read() const;

 private:
  std::atomic<uint32_t> seq_{0};
  StatusSnapshot latest_;
};
