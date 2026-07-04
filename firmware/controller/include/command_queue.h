#pragma once

#include <cstdint>

// Command types and the depth-1 command queue (docs/16). Transports enqueue
// only; ControlTask drains. Cancel is drained before command work each tick.
//
// This header is framework-agnostic (no FreeRTOS includes) so the Command types
// can be shared with the host-side Coordinator tests. The FreeRTOS queue lives
// behind an opaque handle in command_queue.cpp (ESP32 build only).

enum class CommandType : uint8_t { kNone, kDispensePump };

// DispensePump {channel, ml, flow_gate}. channel is 0-based (pump N -> N-1).
// flow_gate true asks for the scale flow gate; the coordinator falls back to a
// timed-from-motor-on pour when the scale is not ready (docs/16 dispense step).
struct DispenseCommand {
  uint8_t channel = 0;
  float ml = 0.0f;
  bool flow_gate = false;
};

struct Command {
  CommandType type = CommandType::kNone;
  DispenseCommand dispense;
};

class CommandQueue {
 public:
  // Returns false if the underlying FreeRTOS queue could not be allocated.
  bool begin();

  // Enqueue APIs — used by SerialTransport only for now (docs/16: enqueue only).
  // Returns false when the single slot is already full (busy / duplicate).
  bool enqueueDispense(const DispenseCommand& command);
  void enqueueCancel();

  // drainCancel() processes any pending cancel first (docs/16 tick order).
  bool drainCancel();
  // Pops at most one command; false when the slot is empty.
  bool drainCommand(Command& out);

 private:
  // Opaque FreeRTOS QueueHandle_t (depth 1); nullptr until begin() / on native.
  void* queue_ = nullptr;
  // HTTP PREREQUISITE: `volatile` is only safe while the sole producer (serial)
  // runs on the ControlTask. drainCancel() is a read-modify-write, so once the
  // Core-0 HTTP task enqueues cancels this MUST become std::atomic<bool> with
  // exchange() or a dropped stop becomes a spill (docs/16 HTTP prerequisites).
  volatile bool cancel_pending_ = false;
};
