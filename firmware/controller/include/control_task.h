#pragma once

#include <Arduino.h>

#include "command_queue.h"
#include "coordinator.h"
#include "machine_inputs.h"
#include "pump_bus.h"
#include "scale_platform.h"
#include "serial_transport.h"
#include "status_snapshot.h"

// Periodic motion owner (docs/16). Fixed-period FreeRTOS task on Core 1; sole
// writer of motor outputs and the status snapshot. Scale/coordinator join this
// task as their subsystems land.
class ControlTask {
 public:
  void begin();  // safe GPIO + subsystem init (call in setup, before start())
  void start();  // spawn the pinned periodic task

 private:
  static void taskEntry(void* arg);
  void run();   // vTaskDelayUntil loop
  void tick();  // one control period

  MachineInputs inputs_;
  PumpBus pumps_;
  ScalePlatform scale_;
  CommandQueue queue_;
  Coordinator coordinator_;
  StatusPublisher status_;
  SerialTransport serial_;
  TaskHandle_t handle_ = nullptr;
  bool prev_job_busy_ = false;
};
