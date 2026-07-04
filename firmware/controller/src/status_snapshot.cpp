#include "status_snapshot.h"

void StatusPublisher::begin() {
  seq_.store(0, std::memory_order_relaxed);
  latest_ = StatusSnapshot{};
}

void StatusPublisher::publish(const StatusSnapshot& snapshot) {
  // Seqlock: odd generation while copying (docs/16 tear-free HTTP read).
  seq_.fetch_add(1, std::memory_order_release);
  latest_ = snapshot;
  seq_.fetch_add(1, std::memory_order_release);
}

StatusSnapshot StatusPublisher::read() const {
  StatusSnapshot copy;
  for (int attempt = 0; attempt < 4; ++attempt) {
    const uint32_t before = seq_.load(std::memory_order_acquire);
    if (before & 1U) {
      continue;
    }
    copy = latest_;
    const uint32_t after = seq_.load(std::memory_order_acquire);
    if (before == after) {
      return copy;
    }
  }
  return latest_;
}
