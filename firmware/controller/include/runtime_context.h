#pragma once

#include <atomic>

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

  // Kiosk link watchdog — armed only for HTTP-started motion jobs.
  // GET /status (and other HTTP) refreshes last_http_activity_ms.
  std::atomic<unsigned long> last_http_activity_ms{0};
  std::atomic<bool> kiosk_job_watchdog_armed{false};
};

RuntimeContext& runtimeContext();
