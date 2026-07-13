#pragma once

#include <Arduino.h>

#include "coordinator.h"
#include "device_status.h"
#include "pump_bus.h"
#include "scale_platform.h"
#include "sequence_runner.h"
#include "serial_transport.h"

class ControlTask {
 public:
  void begin();
  void start();

 private:
  static void taskEntry(void* arg);
  void run();
  void tick();
  void drainConfigOps();
  void publishConfigAndInventory(StatusSnapshot& snapshot);
  void updatePumpJobSnapshot(StatusSnapshot& snapshot, unsigned long now);
  void updateJobTerminalLatch(StatusSnapshot& snapshot, unsigned long now);
  void armJobTerminal(JobTerminalState state, unsigned long now,
                      JobReject reject = JobReject::kNone);
  void clearPumpJobContext();
  void setPumpJobFromDispense(const DispenseCommand& cmd, unsigned long now);
  void setPumpJobFromPrime(uint8_t channel, unsigned long now);

  PumpBus pumps_;
  ScalePlatform scale_;
  Coordinator coordinator_;
  SequenceRunner sequence_;
  SerialTransport serial_;
  TaskHandle_t handle_ = nullptr;
  bool prev_top_job_busy_ = false;
  bool prev_sequence_busy_ = false;
  bool store_persist_error_ = false;
  unsigned long last_config_commit_attempt_ms_ = 0;

  char active_recipe_id_[kRecipeIdMax] = {0};
  uint8_t pump_job_pump_id_ = 0;
  uint8_t pump_job_purpose_ = 0;
  unsigned long pump_job_start_ms_ = 0;
  float pump_job_target_ml_ = 0.0f;
  unsigned long pump_job_duration_ms_ = 0;

  JobTerminalState job_terminal_ = JobTerminalState::kNone;
  unsigned long job_terminal_until_ms_ = 0;
  char terminal_recipe_id_[kRecipeIdMax] = {0};
  JobReject terminal_reject_ = JobReject::kNone;
  bool config_op_apply_failed_ = false;
};
