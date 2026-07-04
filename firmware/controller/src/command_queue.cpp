#include "command_queue.h"

// Depth-1 command queue plus a single cancel flag. Only the serial transport
// enqueues today and it runs on the ControlTask, so there is no cross-task
// contention yet; the FreeRTOS backend keeps the HTTP task (Core 0, deferred)
// correct without a mutex, matching docs/16.

bool CommandQueue::begin(const QueueOps& ops) {
  ops_ = &ops;
  cancel_pending_.store(false, std::memory_order_relaxed);
  preserve_queued_dispense_on_drain_ = false;
  handle_ = nullptr;

  if (ops.create == nullptr || ops.send == nullptr || ops.receive == nullptr ||
      ops.reset == nullptr || ops.pending == nullptr) {
    return false;
  }

  handle_ = ops_->create(sizeof(Command));
  return handle_ != nullptr;
}

bool CommandQueue::enqueueDispense(const DispenseCommand& command) {
  if (ops_ == nullptr || handle_ == nullptr || ops_->send == nullptr) {
    return false;
  }
  Command cmd;
  cmd.type = CommandType::kDispensePump;
  cmd.dispense = command;
  return ops_->send(handle_, &cmd, sizeof(cmd));
}

void CommandQueue::enqueueCancel() {
  cancel_pending_.store(true, std::memory_order_release);
}

void CommandQueue::markDispenseAfterCancel() {
  preserve_queued_dispense_on_drain_ = true;
}

bool CommandQueue::drainCancel() {
  if (!cancel_pending_.exchange(false, std::memory_order_acq_rel)) {
    return false;
  }
  // Drop a dispense queued *before* cancel in the same burst. When cancel is
  // followed by dispense in one poll(), markDispenseAfterCancel() skips reset.
  if (!preserve_queued_dispense_on_drain_ && ops_ != nullptr && handle_ != nullptr &&
      ops_->reset != nullptr) {
    ops_->reset(handle_);
  }
  preserve_queued_dispense_on_drain_ = false;
  return true;
}

bool CommandQueue::drainCommand(Command& out) {
  if (ops_ == nullptr || handle_ == nullptr || ops_->receive == nullptr) {
    return false;
  }
  return ops_->receive(handle_, &out, sizeof(out));
}

bool CommandQueue::hasPending() const {
  if (ops_ == nullptr || handle_ == nullptr || ops_->pending == nullptr) {
    return false;
  }
  return ops_->pending(handle_) > 0;
}
