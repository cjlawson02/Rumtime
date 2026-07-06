#include "config_op_queue.h"

#include <cstring>

bool ConfigOpQueue::begin(const QueueOps& ops) {
  if (ops.create == nullptr || ops.destroy == nullptr || ops.send == nullptr ||
      ops.receive == nullptr || ops.reset == nullptr || ops.pending == nullptr) {
    return false;
  }
  ops_ = &ops;
  if (handle_ != nullptr) {
    ops_->destroy(handle_);
    handle_ = nullptr;
  }
  handle_ = ops_->create(sizeof(ConfigOp));
  return handle_ != nullptr;
}

bool ConfigOpQueue::enqueue(const ConfigOp& op) {
  if (handle_ == nullptr || ops_ == nullptr) {
    return false;
  }
  if (ops_->pending(handle_) > 0) {
    return false;
  }
  return ops_->send(handle_, &op, sizeof(op));
}

bool ConfigOpQueue::hasPending() const {
  if (handle_ == nullptr || ops_ == nullptr) {
    return false;
  }
  return ops_->pending(handle_) > 0;
}

bool ConfigOpQueue::drain(ConfigOp& out) {
  if (handle_ == nullptr || ops_ == nullptr) {
    return false;
  }
  return ops_->receive(handle_, &out, sizeof(out));
}
