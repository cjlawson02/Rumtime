#pragma once

#include <cstddef>

#include "command_validate.h"
#include "status_snapshot.h"

class CommandQueue;
class StatusPublisher;
class ConfigStore;

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
//   dispense <pump> <ml>        flow-gated (requires scale ready)
//   dispense open <pump> <ml>   timed from motor-on (scale not required)
//   cancel | stop               abort current job; flushes pending queue slot
//   status                      print latest snapshot once
//   cal <pump> <ml_per_s> [anti_drip_ms]   set per-pump calibration (NVS)
//   bind <pump> <ingredient>    bind an ingredient id to a pump (NVS)
//   unbind <pump>               clear a pump binding (NVS)
//   config                      print per-pump calibration + bindings once
//
// Config edits mutate ConfigStore RAM on the ControlTask; the flash write is
// deferred to the next idle commit. They are applied directly (not via the
// dispense queue) because SerialTransport currently runs on the ControlTask —
// see the HTTP prerequisite note in the controller README before a Core-0
// producer edits config concurrently.
class SerialTransport {
 public:
  void begin(CommandQueue& queue, StatusPublisher& status, ConfigStore& config);
  void poll(const StatusSnapshot* status_override = nullptr);  // non-blocking parse -> enqueue / RAM config edit only
  // Called from ControlTask when a job transitions busy -> idle.
  void emitJobEvent(bool ok, JobReject reject);
  void emitJobCancelled();
  // Called when an idle NVS commit fails (once per failure episode).
  void emitConfigPersistError();

 private:
  static constexpr size_t kLineMax = 64;
  static constexpr size_t kMaxBytesPerPoll = 64;

  void handleLine(char* line, const StatusSnapshot* status_override = nullptr);
  void printStatus();
  void applyConfigOp(const ConfigOp& op);
  void printConfig();

  CommandQueue* queue_ = nullptr;
  StatusPublisher* status_ = nullptr;
  ConfigStore* config_ = nullptr;
  char line_[kLineMax] = {};
  size_t len_ = 0;
  bool overflow_ = false;
  bool cancel_pending_this_poll_ = false;
};
