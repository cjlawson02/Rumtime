#pragma once

#include <cstddef>

#include "command_validate.h"
#include "config_op_queue.h"
#include "status_snapshot.h"

class CommandQueue;
class StatusPublisher;
class ConfigStore;
class InventoryStore;

// Enqueue-only serial transport (docs/16 Layer 3). Non-blocking line parser
// polled from ControlTask::tick(); it only pushes to the command / config-op
// queues and reads the status snapshot.
class SerialTransport {
 public:
  void begin(CommandQueue& queue, StatusPublisher& status, ConfigStore& config,
             InventoryStore& inventory, ConfigOpQueue& config_queue);
  void poll(const StatusSnapshot* status_override = nullptr);
  void emitJobEvent(bool ok, JobReject reject);
  void emitJobCancelled();
  void emitConfigPersistError();

 private:
  static constexpr size_t kLineMax = 512;
  static constexpr size_t kMaxBytesPerPoll = 64;

  void handleLine(char* line, const StatusSnapshot* status_override = nullptr);
  void printStatus();
  void printConfig();
  bool handleWifiCommand(char* line);

  CommandQueue* queue_ = nullptr;
  StatusPublisher* status_ = nullptr;
  ConfigStore* config_ = nullptr;
  InventoryStore* inventory_ = nullptr;
  ConfigOpQueue* config_queue_ = nullptr;
  char line_[kLineMax] = {};
  size_t len_ = 0;
  bool overflow_ = false;
  bool cancel_pending_this_poll_ = false;
  bool command_enqueued_this_poll_ = false;
};
