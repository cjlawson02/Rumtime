#include "control_task.h"

#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>

#include <cstring>

#include "config.h"
#include "config_store.h"
#include "device_status.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "gpio_ops.h"
#include "http_validate.h"
#include "job_status.h"
#include "queue_ops.h"
#include "runtime_context.h"
#include "scale_ops.h"

namespace {

void fatalRestart(const char* message) {
  Serial.println(message);
  Serial.flush();
  esp_restart();
}

void arduinoPinMode(int pin, uint8_t mode) {
  if (mode == kGpioModeOutput) {
    pinMode(pin, OUTPUT);
  }
}

void arduinoDigitalWrite(int pin, uint8_t level) {
  digitalWrite(pin, level == kGpioLevelHigh ? HIGH : LOW);
}

void arduinoAnalogWrite(int pin, int duty) {
  analogWrite(pin, duty);
}

const GpioOps kArduinoGpioOps = {
    arduinoPinMode,
    arduinoDigitalWrite,
    arduinoAnalogWrite,
};

HX711 g_hx711;

void hx711Begin(int dout, int sck) {
  g_hx711.begin(dout, sck);
}
bool hx711WaitReady(unsigned long timeout_ms) {
  return g_hx711.wait_ready_timeout(timeout_ms);
}
bool hx711IsReady() {
  return g_hx711.is_ready();
}
float hx711GetUnits() {
  return g_hx711.get_units(1);
}
long hx711ReadRaw() {
  return g_hx711.read();
}
void hx711SetScale(float factor) {
  g_hx711.set_scale(factor);
}
void hx711SetOffset(long offset) {
  g_hx711.set_offset(offset);
}

const ScaleOps kHx711Ops = {
    hx711Begin,   hx711WaitReady, hx711IsReady,   hx711GetUnits,
    hx711ReadRaw, hx711SetScale,  hx711SetOffset,
};

Preferences g_prefs;

bool prefsBegin(const char* ns) {
  return g_prefs.begin(ns, /*readOnly=*/false);
}
bool prefsGetBlob(const char* key, void* out, std::size_t len) {
  if (g_prefs.getBytesLength(key) != len) {
    return false;
  }
  return g_prefs.getBytes(key, out, len) == len;
}
bool prefsSetBlob(const char* key, const void* data, std::size_t len) {
  return g_prefs.putBytes(key, data, len) == len;
}
bool prefsCommit() {
  return g_prefs.commit();
}

const NvsOps kPrefsOps = {
    prefsBegin,
    prefsGetBlob,
    prefsSetBlob,
    prefsCommit,
};

void* freertosQueueCreate(std::size_t item_size) {
  return xQueueCreate(1, item_size);
}

void freertosQueueDestroy(void* handle) {
  if (handle != nullptr) {
    vQueueDelete(static_cast<QueueHandle_t>(handle));
  }
}

bool freertosQueueSend(void* handle, const void* item, std::size_t item_size) {
  (void)item_size;
  return xQueueSend(static_cast<QueueHandle_t>(handle), item, 0) == pdTRUE;
}

bool freertosQueueReceive(void* handle, void* out, std::size_t item_size) {
  (void)item_size;
  return xQueueReceive(static_cast<QueueHandle_t>(handle), out, 0) == pdTRUE;
}

void freertosQueueReset(void* handle) {
  xQueueReset(static_cast<QueueHandle_t>(handle));
}

unsigned freertosQueuePending(void* handle) {
  return static_cast<unsigned>(uxQueueMessagesWaiting(static_cast<QueueHandle_t>(handle)));
}

const QueueOps kFreeRtosQueueOps = {
    freertosQueueCreate,  freertosQueueDestroy, freertosQueueSend,
    freertosQueueReceive, freertosQueueReset,   freertosQueuePending,
};

RuntimeContext& ctx() {
  return runtimeContext();
}

}  // namespace

void ControlTask::begin() {
  pumps_.begin(kArduinoGpioOps);
  scale_.begin(kHx711Ops);
  ctx().config.begin(kPrefsOps);
  ctx().inventory.begin(kPrefsOps);
  if (!ctx().queue.begin(kFreeRtosQueueOps)) {
    fatalRestart("command queue alloc failed; restarting");
  }
  if (!ctx().config_queue.begin(kFreeRtosQueueOps)) {
    fatalRestart("config op queue alloc failed; restarting");
  }
  coordinator_.begin(pumps_, scale_, ctx().config);
  sequence_.begin(coordinator_, ctx().config, ctx().inventory, pumps_, scale_);
  ctx().status.begin();
  serial_.begin(ctx().queue, ctx().status, ctx().config, ctx().inventory, ctx().config_queue);
}

void ControlTask::start() {
  const BaseType_t created =
      xTaskCreatePinnedToCore(taskEntry, "control", kControlTaskStackBytes, this,
                              kControlTaskPriority, &handle_, kControlTaskCore);
  if (created != pdPASS) {
    fatalRestart("ControlTask start failed; restarting");
  }
}

void ControlTask::taskEntry(void* arg) {
  static_cast<ControlTask*>(arg)->run();
}

void ControlTask::run() {
  const uint32_t timeout_s = (kControlTaskWdtTimeoutMs + 999U) / 1000U;
  esp_err_t wdt_err = esp_task_wdt_init(timeout_s, true);
  if (wdt_err == ESP_ERR_INVALID_STATE) {
    wdt_err = ESP_OK;
  }
  if (wdt_err != ESP_OK) {
    fatalRestart("TWDT init/reconfigure failed; restarting");
  }
  if (esp_task_wdt_add(nullptr) != ESP_OK) {
    fatalRestart("TWDT add failed; restarting");
  }

  const TickType_t period = pdMS_TO_TICKS(kControlTaskPeriodMs);
  TickType_t last_wake = xTaskGetTickCount();
  for (;;) {
    tick();
    vTaskDelayUntil(&last_wake, period);
  }
}

void ControlTask::drainConfigOps() {
  PendingConfigOp pending;
  while (ctx().config_queue.drain(pending)) {
    const ConfigOpReject reject = applyConfigOp(pending.config, ctx().config, ctx().inventory);
    if (reject != ConfigOpReject::kNone) {
      config_op_apply_failed_ = true;
    } else {
      config_op_apply_failed_ = false;
    }
  }
}

void ControlTask::clearPumpJobContext() {
  pump_job_pump_id_ = 0;
  pump_job_purpose_ = 0;
  pump_job_start_ms_ = 0;
  pump_job_target_ml_ = 0.0f;
  pump_job_duration_ms_ = 0;
}

void ControlTask::setPumpJobFromDispense(const DispenseCommand& cmd, unsigned long now) {
  if (cmd.pump_job_purpose == 0) {
    return;
  }
  pump_job_pump_id_ = static_cast<uint8_t>(cmd.channel + 1);
  pump_job_purpose_ = cmd.pump_job_purpose;
  pump_job_start_ms_ = now;
  pump_job_target_ml_ = cmd.pump_job_target_ml;
  pump_job_duration_ms_ = cmd.pump_job_duration_ms;
}

void ControlTask::setPumpJobFromPrime(uint8_t channel, unsigned long now) {
  pump_job_pump_id_ = static_cast<uint8_t>(channel + 1);
  pump_job_purpose_ = static_cast<uint8_t>(PumpJobPurposeWire::kPrime);
  pump_job_start_ms_ = now;
  pump_job_target_ml_ = 0.0f;
  pump_job_duration_ms_ = 0;
}

void ControlTask::updatePumpJobSnapshot(StatusSnapshot& snapshot, unsigned long now) {
  (void)now;
  if (sequence_.busy()) {
    clearPumpJobContext();
    snapshot.pump_job_pump_id = 0;
    return;
  }
  if (!coordinator_.busy()) {
    clearPumpJobContext();
    snapshot.pump_job_pump_id = 0;
    return;
  }
  snapshot.pump_job_pump_id = pump_job_pump_id_;
  snapshot.pump_job_purpose = pump_job_purpose_;
  snapshot.pump_job_start_ms = pump_job_start_ms_;
  snapshot.pump_job_target_ml = pump_job_target_ml_;
  snapshot.pump_job_duration_ms = pump_job_duration_ms_;
}

void ControlTask::armJobTerminal(JobTerminalState state, unsigned long now) {
  job_terminal_ = state;
  job_terminal_until_ms_ = now + kJobTerminalLatchMs;
  std::strncpy(terminal_recipe_id_, active_recipe_id_, kRecipeIdMax - 1);
  terminal_recipe_id_[kRecipeIdMax - 1] = '\0';
}

void ControlTask::updateJobTerminalLatch(StatusSnapshot& snapshot, unsigned long now) {
  if (job_terminal_ != JobTerminalState::kNone && now >= job_terminal_until_ms_) {
    job_terminal_ = JobTerminalState::kNone;
    job_terminal_until_ms_ = 0;
    terminal_recipe_id_[0] = '\0';
  }
  snapshot.job_terminal = job_terminal_;
  if (job_terminal_ != JobTerminalState::kNone) {
    std::strncpy(snapshot.terminal_recipe_id, terminal_recipe_id_, kRecipeIdMax - 1);
    snapshot.terminal_recipe_id[kRecipeIdMax - 1] = '\0';
  } else {
    snapshot.terminal_recipe_id[0] = '\0';
  }
}

void ControlTask::publishConfigAndInventory(StatusSnapshot& snapshot) {
  snapshot.published_pump_count = PumpBus::kNumChannels;
  for (uint8_t ch = 0; ch < PumpBus::kNumChannels; ++ch) {
    SnapshotPump& row = snapshot.published_pumps[ch];
    row.pump_id = static_cast<uint8_t>(ch + 1);
    row.bound = ctx().config.bound(ch);
    row.ml_per_second = ctx().config.mlPerSecond(ch);
    row.anti_drip_ms = ctx().config.antiDripMs(ch);
    row.ingredient_id[0] = '\0';
    if (row.bound) {
      std::strncpy(row.ingredient_id, ctx().config.ingredient(ch), kIngredientIdMax - 1);
    }
  }

  uint8_t count = 0;
  for (uint8_t ch = 0; ch < PumpBus::kNumChannels && count < kMaxInventoryEntries; ++ch) {
    if (!ctx().config.bound(ch)) {
      continue;
    }
    const char* ingredient = ctx().config.ingredient(ch);
    bool duplicate = false;
    for (uint8_t i = 0; i < count; ++i) {
      if (std::strcmp(snapshot.published_bindings[i].ingredient_id, ingredient) == 0) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) {
      continue;
    }
    SnapshotBinding& b = snapshot.published_bindings[count];
    std::strncpy(b.ingredient_id, ingredient, kIngredientIdMax - 1);
    b.ingredient_id[kIngredientIdMax - 1] = '\0';
    const InventoryEntry* entry = ctx().inventory.find(ingredient);
    if (entry == nullptr) {
      b.remaining_ml = 0.0f;
      b.bottle_size_ml = 0.0f;
      b.primed = false;
    } else {
      b.remaining_ml = entry->remaining_ml;
      b.bottle_size_ml = entry->bottle_size_ml;
      b.primed = entry->primed;
    }
    ++count;
  }
  snapshot.published_binding_count = count;
}

void ControlTask::tick() {
  const unsigned long now = millis();

  const bool motion_busy = sequence_.busy() || coordinator_.busy();

  StatusSnapshot preflight_status = ctx().status.read();
  preflight_status.config_op_pending = ctx().config_queue.hasPending();

  serial_.poll(&preflight_status);

  if (ctx().queue.drainCancel(motion_busy)) {
    coordinator_.cancel();
    sequence_.cancel();
  }

  scale_.tick(now);

  if (!coordinator_.busy() && !sequence_.busy()) {
    drainConfigOps();
  }

  Command command;
  if (!coordinator_.busy() && !sequence_.busy() && ctx().queue.drainCommand(command)) {
    switch (command.type) {
      case CommandType::kDispensePump:
        coordinator_.clearTerminalResult();
        sequence_.clearTerminalResult();
        if (coordinator_.startDispense(command.dispense, now)) {
          setPumpJobFromDispense(command.dispense, now);
        } else {
          serial_.emitJobEvent(false, coordinator_.lastReject());
        }
        break;
      case CommandType::kPrimePump:
        coordinator_.clearTerminalResult();
        sequence_.clearTerminalResult();
        if (coordinator_.startPrime(command.prime.channel, now)) {
          setPumpJobFromPrime(command.prime.channel, now);
        } else {
          serial_.emitJobEvent(false, coordinator_.lastReject());
        }
        break;
      case CommandType::kPrimeStop:
        coordinator_.stopPrime();
        break;
      case CommandType::kPourSequence:
        std::strncpy(active_recipe_id_, command.pour_sequence.recipe_id, kRecipeIdMax - 1);
        active_recipe_id_[kRecipeIdMax - 1] = '\0';
        if (!sequence_.start(command.pour_sequence.steps, command.pour_sequence.step_count, now)) {
          serial_.emitJobEvent(false, sequence_.lastReject());
          active_recipe_id_[0] = '\0';
        }
        break;
      case CommandType::kNone:
      default:
        break;
    }
  }
  coordinator_.tick(now);
  sequence_.tick(now);

  const bool top_job_busy = sequence_.busy() || coordinator_.busy();

  StatusSnapshot snapshot;
  snapshot.pumps_running = pumps_.anyRunning();
  snapshot.scale_ready = scale_.ready();
  snapshot.grams = scale_.readFilteredGrams();
  snapshot.flow_detected = scale_.flowDetected();
  snapshot.flow_timed_out = scale_.flowTimedOut();
  snapshot.last_delta_g = scale_.lastDeltaG();
  snapshot.job_busy = top_job_busy;
  snapshot.command_pending = ctx().queue.hasPending();
  snapshot.config_op_pending = ctx().config_queue.hasPending();
  snapshot.config_op_apply_failed = config_op_apply_failed_;
  snapshot.sequence_busy = sequence_.busy();
  snapshot.sequence_step_index = sequence_.busy() ? sequence_.stepIndex() : 0;
  snapshot.sequence_step_count = sequence_.busy() ? sequence_.stepCount() : 0;
  if (sequence_.busy()) {
    std::strncpy(snapshot.sequence_ingredient, sequence_.currentIngredient(), kIngredientIdMax - 1);
    snapshot.sequence_ingredient[kIngredientIdMax - 1] = '\0';
    std::strncpy(snapshot.active_recipe_id, active_recipe_id_, kRecipeIdMax - 1);
    snapshot.active_recipe_id[kRecipeIdMax - 1] = '\0';
  } else {
    snapshot.sequence_ingredient[0] = '\0';
    snapshot.active_recipe_id[0] = '\0';
  }

  updatePumpJobSnapshot(snapshot, now);
  updateJobTerminalLatch(snapshot, now);
  publishConfigAndInventory(snapshot);

  JobStatusInputs job_in;
  job_in.sequence_busy = sequence_.busy();
  job_in.sequence_result = sequence_.result();
  job_in.sequence_ok = sequence_.ok();
  job_in.sequence_error = sequence_.error();
  job_in.sequence_cancelled = sequence_.cancelled();
  job_in.sequence_reject = sequence_.lastReject();
  job_in.coordinator_busy = coordinator_.busy();
  job_in.coordinator_ok = coordinator_.ok();
  job_in.coordinator_error = coordinator_.error();
  job_in.coordinator_cancelled = coordinator_.cancelled();
  job_in.coordinator_reject = coordinator_.lastReject();
  job_in.coordinator_phase = coordinator_.phase();
  fillJobStatusFields(job_in, &snapshot.job_ok, &snapshot.job_error, &snapshot.job_cancelled,
                      &snapshot.job_phase, &snapshot.job_reject);
  snapshot.config_dirty = ctx().config.dirty() || ctx().inventory.dirty();
  snapshot.config_persist_error = config_persist_error_ || inventory_persist_error_;
  ctx().status.publish(snapshot);

  if (prev_top_job_busy_ && !top_job_busy) {
    if (prev_sequence_busy_) {
      if (sequence_.cancelled()) {
        armJobTerminal(JobTerminalState::kCancelled, now);
        serial_.emitJobCancelled();
        sequence_.clearTerminalResult();
      } else if (sequence_.ok()) {
        armJobTerminal(JobTerminalState::kComplete, now);
        serial_.emitJobEvent(true, JobReject::kNone);
        sequence_.clearTerminalResult();
      } else {
        serial_.emitJobEvent(false, sequence_.lastReject());
        sequence_.clearTerminalResult();
      }
      active_recipe_id_[0] = '\0';
    } else if (snapshot.job_cancelled) {
      serial_.emitJobCancelled();
      coordinator_.clearTerminalResult();
    } else if (snapshot.job_ok || snapshot.job_error) {
      serial_.emitJobEvent(snapshot.job_ok, snapshot.job_reject);
      coordinator_.clearTerminalResult();
    }
    clearPumpJobContext();
  }
  prev_top_job_busy_ = top_job_busy;
  prev_sequence_busy_ = sequence_.busy();

  if (job_terminal_ != JobTerminalState::kNone) {
    StatusSnapshot latch = snapshot;
    updateJobTerminalLatch(latch, now);
    ctx().status.publish(latch);
  }

  if (!snapshot.job_busy && (ctx().config.dirty() || ctx().inventory.dirty())) {
    if ((now - last_config_commit_attempt_ms_) >= kConfigCommitRetryMs) {
      last_config_commit_attempt_ms_ = now;
      if (esp_task_wdt_reset() != ESP_OK) {
        fatalRestart("TWDT reset failed; restarting");
      }
      const bool stores_ok = commitMachineStores(ctx().config, ctx().inventory, []() {
        if (esp_task_wdt_reset() != ESP_OK) {
          fatalRestart("TWDT reset failed; restarting");
        }
      });
      const bool had_error = config_persist_error_ || inventory_persist_error_;
      config_persist_error_ = !stores_ok;
      inventory_persist_error_ = !stores_ok;
      if ((config_persist_error_ || inventory_persist_error_) && !had_error) {
        serial_.emitConfigPersistError();
      }
      if (esp_task_wdt_reset() != ESP_OK) {
        fatalRestart("TWDT reset failed; restarting");
      }
      snapshot.config_dirty = ctx().config.dirty() || ctx().inventory.dirty();
      snapshot.config_persist_error = config_persist_error_ || inventory_persist_error_;
      ctx().status.publish(snapshot);
    }
  } else if ((config_persist_error_ || inventory_persist_error_) && !ctx().config.dirty() &&
             !ctx().inventory.dirty()) {
    config_persist_error_ = false;
    inventory_persist_error_ = false;
  }

  if (esp_task_wdt_reset() != ESP_OK) {
    fatalRestart("TWDT reset failed; restarting");
  }
}
