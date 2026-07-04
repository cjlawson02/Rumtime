#pragma once

#include <cstddef>

#include "status_snapshot.h"

class CommandQueue;
class StatusPublisher;

// Enqueue-only serial transport (docs/16 Layer 3). Non-blocking line parser
// polled from ControlTask::tick(); it only pushes to the command queue and reads
// the status snapshot. It never touches motor GPIO, I2C, pumps, or the scale.
//
// Marlin-inspired bench serial (docs/16 Layer 3):
//   ok                          command accepted into queue (not pour complete)
//   busy                        queue full / coordinator busy
//   Error:...                   parse or preflight reject
//   // job:ok | // job:error    async pour completion (poll status too)
//
// Commands:
//   dispense <pump> <ml>        flow-gated (falls back to timed if scale not ready)
//   dispense open <pump> <ml>   timed from motor-on (no flow gate)
//   cancel | stop               abort current job; flushes pending queue slot
//   status                      print latest snapshot once
class SerialTransport {
 public:
  void begin(CommandQueue& queue, StatusPublisher& status);
  void poll();  // non-blocking parse -> enqueue only
  // Called from ControlTask when a job transitions busy -> idle.
  void emitJobEvent(bool ok, JobReject reject);

 private:
  static constexpr size_t kLineMax = 64;

  void handleLine(char* line);
  void printStatus();

  CommandQueue* queue_ = nullptr;
  StatusPublisher* status_ = nullptr;
  char line_[kLineMax] = {};
  size_t len_ = 0;
  bool overflow_ = false;
  bool cancel_pending_this_poll_ = false;
};
