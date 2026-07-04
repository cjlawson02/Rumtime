#pragma once

#include <atomic>
#include <cstdint>

#include "queue_ops.h"

// Command types and the depth-1 command queue (docs/16). Transports enqueue
// only; ControlTask drains. Cancel is drained before command work each tick.
//
// Framework-agnostic: queue I/O lives behind QueueOps (FreeRTOS on ESP32,
// in-memory fake in host tests) — same pattern as GpioOps / ScaleOps / NvsOps.

enum class CommandType : uint8_t { kNone, kDispensePump };

// DispensePump {channel, ml, flow_gate}. channel is 0-based (pump N -> N-1).
// flow_gate true requires a ready scale (flow gate). flow_gate false is the
// timed "dispense open" override — no scale required.
struct DispenseCommand {
  uint8_t channel = 0;
  float ml = 0.0f;
  bool flow_gate = false;
  // Captured at enqueue so same-tick config edits cannot change a queued pour.
  float ml_per_s = 0.0f;
  uint32_t anti_drip_ms = 0;
};

struct Command {
  CommandType type = CommandType::kNone;
  DispenseCommand dispense;
};

class CommandQueue {
 public:
  // Returns false if ops is incomplete or the backend could not allocate.
  bool begin(const QueueOps& ops);

  // Enqueue APIs — used by SerialTransport only for now (docs/16: enqueue only).
  // Returns false when the single slot is already full (busy / duplicate).
  bool enqueueDispense(const DispenseCommand& command);
  void enqueueCancel();

  // drainCancel() processes any pending cancel first (docs/16 tick order).
  bool drainCancel();
  // Pops at most one command; false when the slot is empty.
  bool drainCommand(Command& out);

  // True when a dispense is waiting in the depth-1 slot (not yet drained).
  bool hasPending() const;

  // Same serial poll() saw cancel then dispense — preserve the queued pour on drain.
  void markDispenseAfterCancel();

 private:
  const QueueOps* ops_ = nullptr;
  void* handle_ = nullptr;
  std::atomic<bool> cancel_pending_{false};
  bool preserve_queued_dispense_on_drain_ = false;
};
