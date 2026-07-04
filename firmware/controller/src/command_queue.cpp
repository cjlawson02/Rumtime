#include "command_queue.h"

#include <Arduino.h>  // FreeRTOS queue API (xQueueCreate/Send/Receive)

// Depth-1 FreeRTOS command queue plus a single cancel flag. Only the serial
// transport enqueues today and it runs on the ControlTask, so there is no
// cross-task contention yet; the FreeRTOS queue keeps the HTTP task (Core 0,
// deferred) correct without a mutex, matching docs/16.

bool CommandQueue::begin() {
  queue_ = xQueueCreate(1, sizeof(Command));
  cancel_pending_ = false;
  return queue_ != nullptr;  // caller must treat allocation failure as fatal
}

bool CommandQueue::enqueueDispense(const DispenseCommand& command) {
  if (queue_ == nullptr) {
    return false;
  }
  Command cmd;
  cmd.type = CommandType::kDispensePump;
  cmd.dispense = command;
  // Zero block time: a full slot means a job is already pending -> busy.
  return xQueueSend(static_cast<QueueHandle_t>(queue_), &cmd, 0) == pdTRUE;
}

void CommandQueue::enqueueCancel() {
  cancel_pending_ = true;
}

bool CommandQueue::drainCancel() {
  if (!cancel_pending_) {
    return false;
  }
  cancel_pending_ = false;
  // Drop any queued dispense so "cancel" after "dispense" in one serial burst
  // cannot run the pour on the next tick (docs/16 cancel-first drain).
  if (queue_ != nullptr) {
    xQueueReset(static_cast<QueueHandle_t>(queue_));
  }
  return true;
}

bool CommandQueue::drainCommand(Command& out) {
  if (queue_ == nullptr) {
    return false;
  }
  return xQueueReceive(static_cast<QueueHandle_t>(queue_), &out, 0) == pdTRUE;
}
