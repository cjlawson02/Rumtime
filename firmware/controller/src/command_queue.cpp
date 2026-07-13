#include "command_queue.h"

// Depth-1 command queue plus cancel / prime-stop side-channel flags. HTTP on
// Core 0 enqueues; ControlTask drains. FreeRTOS backend keeps cross-core
// enqueue correct without a mutex, matching docs/16.

bool CommandQueue::begin(const QueueOps& ops) {
  ops_ = &ops;
  cancel_pending_.store(false, std::memory_order_relaxed);
  prime_stop_pending_.store(false, std::memory_order_relaxed);
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

bool CommandQueue::enqueuePrime(const PrimeCommand& command) {
  if (ops_ == nullptr || handle_ == nullptr || ops_->send == nullptr) {
    return false;
  }
  Command cmd;
  cmd.type = CommandType::kPrimePump;
  cmd.prime = command;
  return ops_->send(handle_, &cmd, sizeof(cmd));
}

void CommandQueue::enqueuePrimeStop() {
  prime_stop_pending_.store(true, std::memory_order_release);
}

bool CommandQueue::enqueuePourSequence(const PourSequenceCommand& command) {
  if (ops_ == nullptr || handle_ == nullptr || ops_->send == nullptr) {
    return false;
  }
  Command cmd;
  cmd.type = CommandType::kPourSequence;
  cmd.pour_sequence = command;
  return ops_->send(handle_, &cmd, sizeof(cmd));
}

void CommandQueue::enqueueCancel() {
  cancel_pending_.store(true, std::memory_order_release);
}

void CommandQueue::markCommandAfterCancel() {
  preserve_queued_dispense_on_drain_ = true;
}

bool CommandQueue::drainCancel(bool job_was_busy) {
  if (!cancel_pending_.exchange(false, std::memory_order_acq_rel)) {
    return false;
  }
  // Cancel wins over a pending operator prime-stop.
  prime_stop_pending_.store(false, std::memory_order_relaxed);
  // Drop a queued command when cancelling an active job, or when a command is
  // already waiting in the depth-1 slot (abort a pending start). Preserve the
  // slot when markCommandAfterCancel() was set (same-poll cancel then command).
  const bool drop_queued = job_was_busy || hasPending();
  if (drop_queued && !preserve_queued_dispense_on_drain_ && ops_ != nullptr && handle_ != nullptr &&
      ops_->reset != nullptr) {
    ops_->reset(handle_);
  }
  preserve_queued_dispense_on_drain_ = false;
  return true;
}

bool CommandQueue::drainPrimeStop() {
  return prime_stop_pending_.exchange(false, std::memory_order_acq_rel);
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
