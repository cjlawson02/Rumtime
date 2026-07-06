#pragma once

#include <atomic>
#include <cstdint>

#include "config.h"
#include "queue_ops.h"

// Command types and the depth-1 command queue (docs/16). Transports enqueue
// only; ControlTask drains. Cancel is drained before command work each tick.
//
// Framework-agnostic: queue I/O lives behind QueueOps (FreeRTOS on ESP32,
// in-memory fake in host tests) — same pattern as GpioOps / ScaleOps / NvsOps.

enum class CommandType : uint8_t { kNone, kDispensePump, kPrimePump, kPrimeStop, kPourSequence };

// DispensePump {channel, ml, flow_gate}. channel is 0-based (pump N -> N-1).
// flow_gate true requires a ready scale (flow gate). flow_gate false is the
// timed "dispense open" override — no scale required.
// pump_job_purpose: PumpJobPurposeWire for kiosk pumpJob; 0 = plain dispense (no pumpJob).
struct DispenseCommand {
  uint8_t channel = 0;
  float ml = 0.0f;
  bool flow_gate = false;
  float ml_per_s = 0.0f;
  uint32_t anti_drip_ms = 0;
  uint8_t pump_job_purpose = 0;
  float pump_job_target_ml = 0.0f;
  unsigned long pump_job_duration_ms = 0;
};

// PrimePump {channel}. channel is 0-based (pump N -> N-1). Continuous forward run
// until operator prime stop or safety timeout — no scale, no anti-drip on stop.
struct PrimeCommand {
  uint8_t channel = 0;
};

// One recipe/manual pour step: opaque ingredient id + volume. Resolved to a pump
// via ConfigStore at run time (docs/16 phase 4).
struct PourSequenceStep {
  char ingredient_id[kIngredientIdMax] = {0};
  float ml = 0.0f;
};

// Multi-step pour sequence (sequential only; parallel groups deferred).
struct PourSequenceCommand {
  char recipe_id[kRecipeIdMax] = {0};
  PourSequenceStep steps[kMaxPourSequenceSteps] = {};
  uint8_t step_count = 0;
};

struct Command {
  CommandType type = CommandType::kNone;
  DispenseCommand dispense;
  PrimeCommand prime;
  PourSequenceCommand pour_sequence;
};

class CommandQueue {
 public:
  // Returns false if ops is incomplete or the backend could not allocate.
  bool begin(const QueueOps& ops);

  // Enqueue APIs — used by SerialTransport only for now (docs/16: enqueue only).
  // Returns false when the single slot is already full (busy / duplicate).
  bool enqueueDispense(const DispenseCommand& command);
  bool enqueuePrime(const PrimeCommand& command);
  bool enqueuePrimeStop();
  bool enqueuePourSequence(const PourSequenceCommand& command);
  void enqueueCancel();

  // drainCancel() processes any pending cancel first (docs/16 tick order).
  // job_was_busy: only drop a queued command when cancelling an active job.
  bool drainCancel(bool job_was_busy);
  // Pops at most one command; false when the slot is empty.
  bool drainCommand(Command& out);

  // True when a dispense is waiting in the depth-1 slot (not yet drained).
  bool hasPending() const;

  // Same serial poll() saw cancel then a command — preserve the queued slot on drain.
  void markCommandAfterCancel();

 private:
  const QueueOps* ops_ = nullptr;
  void* handle_ = nullptr;
  std::atomic<bool> cancel_pending_{false};
  bool preserve_queued_dispense_on_drain_ = false;
};
