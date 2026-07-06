#pragma once

#include "command_queue.h"
#include "config_op_queue.h"
#include "config_store.h"
#include "inventory_store.h"
#include "status_snapshot.h"

// Shared services: HTTP (Core 0) enqueues; ControlTask (Core 1) drains and publishes status.
struct RuntimeContext {
  CommandQueue queue;
  ConfigOpQueue config_queue;
  StatusPublisher status;
  ConfigStore config;
  InventoryStore inventory;
};

RuntimeContext& runtimeContext();
