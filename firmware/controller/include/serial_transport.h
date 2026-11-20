#pragma once

#include <cstddef>

#include "command_validate.h"
#include "config_op_queue.h"
#include "status_snapshot.h"

class CommandQueue;
class ConfigStore;
class InventoryStore;
class PumpBus;

// Enqueue-only serial transport (docs/16 Layer 3). Non-blocking line parser
// polled from ControlTask::tick(); it only pushes to the command / config-op
// queues and reads the status snapshot.
class SerialTransport {
 public:
  void begin(CommandQueue& queue, ConfigStore& config, InventoryStore& inventory,
             ConfigOpQueue& config_queue, PumpBus& pumps);
  // status: the ControlTask's snapshot for this tick (preflight + `status` output).
  void poll(const StatusSnapshot& status);
  void emitJobEvent(bool ok, JobReject reject);
  void emitJobCancelled();
  void emitConfigPersistError();
  void emitStackLow(uint32_t control_free, uint32_t network_free);

 private:
  static constexpr size_t kLineMax = 512;
  static constexpr size_t kMaxBytesPerPoll = 64;

  void handleLine(char* line, const StatusSnapshot& status);
  void printStatus(const StatusSnapshot& status);
  void printConfig();
  bool handleWifiCommand(char* line);
  bool handleBringupCommand(char* line, const StatusSnapshot& status);

  CommandQueue* queue_ = nullptr;
  ConfigStore* config_ = nullptr;
  InventoryStore* inventory_ = nullptr;
  ConfigOpQueue* config_queue_ = nullptr;
  PumpBus* pumps_ = nullptr;
  char line_[kLineMax] = {};
  size_t len_ = 0;
  bool overflow_ = false;
  bool cancel_pending_this_poll_ = false;
  bool command_enqueued_this_poll_ = false;
};
