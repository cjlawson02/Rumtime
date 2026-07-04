#include "status_snapshot.h"

void StatusPublisher::begin() {
}

void StatusPublisher::publish(const StatusSnapshot& snapshot) {
  // Stub: plain copy for now. Future: seqlock / double-buffer for tear-free HTTP read.
  latest_ = snapshot;
}

StatusSnapshot StatusPublisher::read() const {
  return latest_;
}
