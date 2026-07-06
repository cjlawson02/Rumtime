#pragma once

#include <cstdint>

#include "command_validate.h"
#include "queue_ops.h"

// Cross-task config + inventory op queue (depth 1). HTTP on Core 0 enqueues;
// ControlTask drains and applies to ConfigStore / InventoryStore RAM only.
// Same busy gates as serial config edits (job_busy, sequence_busy, command_pending).

enum class ConfigOpReject : uint8_t {
  kNone,
  kBusy,
  kBadPump,
  kBadCalibration,
  kBadIngredient,
  kBadArgs,
};

class ConfigOpQueue {
 public:
  bool begin(const QueueOps& ops);

  // Returns false when depth-1 slot full (409 busy).
  bool enqueue(const ConfigOp& op);

  bool hasPending() const;
  bool drain(ConfigOp& out);

 private:
  const QueueOps* ops_ = nullptr;
  void* handle_ = nullptr;
};
