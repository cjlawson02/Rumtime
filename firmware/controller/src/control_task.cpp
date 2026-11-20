#include "control_task.h"

#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>
#include <Wire.h>

#include <cstring>

#include "config.h"
#include "config_store.h"
#include "device_status.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "gpio_ops.h"
#include "http_validate.h"
#include "i2c_ops.h"
#include "job_status.h"
#include "network_task.h"
#include "queue_ops.h"
#include "runtime_context.h"
#include "scale_ops.h"
#include "wifi_link_safety.h"

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

const GpioOps kArduinoGpioOps = {
    arduinoPinMode,
    arduinoDigitalWrite,
};

void arduinoI2cBeginBus(int sda, int scl) {
  Wire.begin(sda, scl);
  Wire.setTimeOut(kI2cTimeoutMs);
}

// Free a slave holding SDA low (e.g. module unplugged mid-transfer or an ESP reset
// mid-byte): clock SCL until SDA releases, then issue a STOP and restart Wire.
// Bounded to ~100 us of busy-wait so it is safe inside the ControlTask period.
void i2cBusClear() {
  Wire.end();
  pinMode(pins::kI2cSda, INPUT_PULLUP);
  pinMode(pins::kI2cScl, OUTPUT_OPEN_DRAIN);
  digitalWrite(pins::kI2cScl, HIGH);
  for (int i = 0; i < 9 && digitalRead(pins::kI2cSda) == LOW; ++i) {
    digitalWrite(pins::kI2cScl, LOW);
    delayMicroseconds(5);
    digitalWrite(pins::kI2cScl, HIGH);
    delayMicroseconds(5);
  }
  pinMode(pins::kI2cSda, OUTPUT_OPEN_DRAIN);
  digitalWrite(pins::kI2cSda, LOW);
  delayMicroseconds(5);
  digitalWrite(pins::kI2cSda, HIGH);  // STOP: SDA rises while SCL high
  delayMicroseconds(5);
  arduinoI2cBeginBus(pins::kI2cSda, pins::kI2cScl);
}

bool arduinoI2cWriteReg(uint8_t addr7, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(addr7);
  Wire.write(reg);
  Wire.write(value);
  const uint8_t err = Wire.endTransmission();
  // 2/3 = address/data NACK (no module, or noise): bus is fine. 4/5 = bus error or
  // timeout: the bus may be stuck, so clear it before the caller retries.
  if (err == 4 || err == 5) {
    i2cBusClear();
  }
  return err == 0;
}

const I2cOps kArduinoI2cOps = {
    arduinoI2cBeginBus,
    arduinoI2cWriteReg,
};

HX711 g_hx711;

void hx711Begin(int dout, int sck) {
  g_hx711.begin(dout, sck);
  // bogde/HX711 leaves DOUT as plain INPUT on ARCH_ESPRESSIF (an ESP8266
  // workaround). On the S3 a missing module then floats low and reads as
  // "ready" with all-zero data. A real HX711 drives DOUT push-pull.
  pinMode(dout, INPUT_PULLUP);
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
  // Preferences::begin() returns false when the namespace is already open.
  // ConfigStore and InventoryStore both call begin() at boot; idle commit must
  // reopen cleanly before putBytes.
  g_prefs.end();
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
const NvsOps kPrefsOps = {
    prefsBegin,
    prefsGetBlob,
    prefsSetBlob,
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
  pumps_.begin(kArduinoGpioOps, kArduinoI2cOps);
  pinMode(pins::kRingLight, OUTPUT);
  digitalWrite(pins::kRingLight, LOW);
  scale_.begin(kHx711Ops);
  ctx().config.begin(kPrefsOps);
  ctx().inventory.begin(kPrefsOps);
  applyPumpPolarity();
  if (!ctx().queue.begin(kFreeRtosQueueOps)) {
    fatalRestart("command queue alloc failed; restarting");
  }
  if (!ctx().config_queue.begin(kFreeRtosQueueOps)) {
    fatalRestart("config op queue alloc failed; restarting");
  }
  coordinator_.begin(pumps_, scale_, ctx().config);
  sequence_.begin(coordinator_, ctx().config, ctx().inventory, pumps_, scale_);
  ctx().status.begin();
  pinMode(pins::kLedStatus, OUTPUT);
  digitalWrite(pins::kLedStatus, LOW);
  serial_.begin(ctx().queue, ctx().config, ctx().inventory, ctx().config_queue, pumps_);
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
  // IDF 5.x: esp_task_wdt_init takes esp_task_wdt_config_t (Arduino-ESP32 3.x).
  const esp_task_wdt_config_t wdt_config = {
      .timeout_ms = kControlTaskWdtTimeoutMs,
      .idle_core_mask = 0,
      .trigger_panic = true,
  };
  esp_err_t wdt_err = esp_task_wdt_init(&wdt_config);
  if (wdt_err == ESP_ERR_INVALID_STATE) {
    wdt_err = esp_task_wdt_reconfigure(&wdt_config);
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
  ConfigOp pending;
  while (ctx().config_queue.drain(pending)) {
    const ConfigOpReject reject = applyConfigOp(pending, ctx().config, ctx().inventory);
    if (reject != ConfigOpReject::kNone) {
      config_op_apply_failed_ = true;
    } else {
      config_op_apply_failed_ = false;
    }
    applyPumpPolarity();
  }
}

// Idle only (config ops drain when idle); PumpBus refuses a change on a running channel.
void ControlTask::applyPumpPolarity() {
  for (uint8_t ch = 0; ch < PumpBus::kNumChannels; ++ch) {
    pumps_.setInvertPolarity(ch, ctx().config.invertPolarity(ch));
  }
}

// High-water marks only shrink; sampled at 1 Hz (each call scans the unused stack).
void ControlTask::sampleStacks(unsigned long now) {
  if (last_stack_sample_ms_ != 0 && (now - last_stack_sample_ms_) < kStackSampleMs) {
    return;
  }
  last_stack_sample_ms_ = now == 0 ? 1 : now;
  control_stack_free_ = static_cast<uint32_t>(uxTaskGetStackHighWaterMark(nullptr));
  network_stack_free_ = networkTaskStackFree();
  const bool low = control_stack_free_ < kStackLowWaterBytes ||
                   (network_stack_free_ != 0 && network_stack_free_ < kStackLowWaterBytes);
  if (low && !stack_low_reported_) {
    serial_.emitStackLow(control_stack_free_, network_stack_free_);
  }
  stack_low_reported_ = low;
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

void ControlTask::armJobTerminal(JobTerminalState state, unsigned long now, JobReject reject) {
  job_terminal_ = state;
  job_terminal_until_ms_ = now + kJobTerminalLatchMs;
  terminal_reject_ = reject;
  std::strncpy(terminal_recipe_id_, active_recipe_id_, kRecipeIdMax - 1);
  terminal_recipe_id_[kRecipeIdMax - 1] = '\0';
}

void ControlTask::updateJobTerminalLatch(StatusSnapshot& snapshot, unsigned long now) {
  if (job_terminal_ != JobTerminalState::kNone && now >= job_terminal_until_ms_) {
    job_terminal_ = JobTerminalState::kNone;
    job_terminal_until_ms_ = 0;
    terminal_recipe_id_[0] = '\0';
    terminal_reject_ = JobReject::kNone;
  }
  snapshot.job_terminal = job_terminal_;
  if (job_terminal_ != JobTerminalState::kNone) {
    std::strncpy(snapshot.terminal_recipe_id, terminal_recipe_id_, kRecipeIdMax - 1);
    snapshot.terminal_recipe_id[kRecipeIdMax - 1] = '\0';
    if (job_terminal_ == JobTerminalState::kError) {
      snapshot.job_reject = terminal_reject_;
    }
  } else {
    snapshot.terminal_recipe_id[0] = '\0';
  }
}

void ControlTask::publishConfigAndInventory(StatusSnapshot& snapshot) {
  // Only detected pumps are published, so the kiosk never offers a pump whose
  // module is missing and HTTP preflight cannot resolve an ingredient to one.
  snapshot.pumps_missing_mask = pumps_.missingChannelMask();
  uint8_t pump_count = 0;
  for (uint8_t ch = 0; ch < PumpBus::kNumChannels; ++ch) {
    if (!pumps_.channelPresent(ch)) {
      continue;
    }
    SnapshotPump& row = snapshot.published_pumps[pump_count++];
    row.pump_id = static_cast<uint8_t>(ch + 1);
    row.bound = ctx().config.bound(ch);
    row.ml_per_second = ctx().config.mlPerSecond(ch);
    row.anti_drip_ms = ctx().config.antiDripMs(ch);
    row.ingredient_id[0] = '\0';
    if (row.bound) {
      std::strncpy(row.ingredient_id, ctx().config.ingredient(ch), kIngredientIdMax - 1);
    }
  }
  snapshot.published_pump_count = pump_count;

  uint8_t count = 0;
  for (uint8_t ch = 0; ch < PumpBus::kNumChannels && count < kMaxInventoryEntries; ++ch) {
    if (!ctx().config.bound(ch) || !pumps_.channelPresent(ch)) {
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

  // One StatusSnapshot for the whole tick: last published status for serial
  // preflight, then reset so nothing stale is carried into this tick's publish.
  StatusSnapshot& snapshot = snapshot_;
  ctx().status.read(snapshot);
  snapshot.config_op_pending = ctx().config_queue.hasPending();
  serial_.poll(snapshot);
  snapshot = StatusSnapshot{};

  // HTTP-started jobs: miss GET /status (and other HTTP) for too long → cancel.
  // Enqueue before drainCancel so the abort applies this tick. Keep the watchdog
  // armed while a command is still queued (not busy yet).
  {
    const bool armed = ctx().kiosk_job_watchdog_armed.load(std::memory_order_acquire);
    const bool pending = ctx().queue.hasPending();
    if (armed && (motion_busy || pending)) {
      cancelOnHeartbeatTimeout(ctx().queue, true, true, now,
                               ctx().last_http_activity_ms.load(std::memory_order_relaxed),
                               kKioskHeartbeatTimeoutMs);
    }
  }

  if (ctx().queue.drainCancel(motion_busy)) {
    coordinator_.cancel();
    sequence_.cancel();
  } else if (ctx().queue.drainPrimeStop()) {
    coordinator_.stopPrime();
  }

  scale_.tick(now);

  if (!coordinator_.busy() && !sequence_.busy()) {
    drainConfigOps();
    if ((now - last_pump_rescan_ms_) >= kPumpModuleRescanMs) {
      last_pump_rescan_ms_ = now;
      pumps_.rescan();
      applyPumpPolarity();
    }
  }

  if (!coordinator_.busy() && !sequence_.busy()) {
    sequence_.setScaleBypass(ctx().bench_scale_bypass.load(std::memory_order_relaxed));
    Command command;
    if (ctx().queue.drainCommand(command)) {
      switch (command.type) {
        case CommandType::kDispensePump:
          coordinator_.clearTerminalResult();
          sequence_.clearTerminalResult();
          if (coordinator_.startDispense(command.dispense, now)) {
            setPumpJobFromDispense(command.dispense, now);
          } else {
            serial_.emitJobEvent(false, coordinator_.lastReject());
            coordinator_.clearTerminalResult();
          }
          break;
        case CommandType::kPrimePump:
          coordinator_.clearTerminalResult();
          sequence_.clearTerminalResult();
          if (coordinator_.startPrime(command.prime.channel, now)) {
            setPumpJobFromPrime(command.prime.channel, now);
          } else {
            serial_.emitJobEvent(false, coordinator_.lastReject());
            coordinator_.clearTerminalResult();
          }
          break;
        case CommandType::kPourSequence:
          std::strncpy(active_recipe_id_, command.pour_sequence.recipe_id, kRecipeIdMax - 1);
          active_recipe_id_[kRecipeIdMax - 1] = '\0';
          if (!sequence_.start(command.pour_sequence, now)) {
            armJobTerminal(JobTerminalState::kError, now, sequence_.lastReject());
            serial_.emitJobEvent(false, sequence_.lastReject());
            sequence_.clearTerminalResult();
            coordinator_.clearTerminalResult();
            active_recipe_id_[0] = '\0';
          }
          break;
        case CommandType::kNone:
        default:
          break;
      }
    }
  }
  coordinator_.tick(now);
  sequence_.tick(now);

  const bool top_job_busy = sequence_.busy() || coordinator_.busy();

  sampleStacks(now);
  snapshot.control_stack_free = control_stack_free_;
  snapshot.network_stack_free = network_stack_free_;
  snapshot.pumps_running = pumps_.anyRunning();
  snapshot.scale_ready = scale_.ready();
  snapshot.scale_bypass = ctx().bench_scale_bypass.load(std::memory_order_relaxed);
  snapshot.glass_present = scale_.glassPresent();
  snapshot.grams = scale_.readFilteredGrams();
  snapshot.flow_detected = scale_.flowDetected();
  snapshot.flow_timed_out = scale_.flowTimedOut();
  snapshot.last_delta_g = scale_.lastDeltaG();
  digitalWrite(pins::kRingLight, snapshot.glass_present ? HIGH : LOW);
  // LED_STATUS blinks while PUMP_BUS_ENABLE (STBY) is high, off otherwise. Only
  // written on changes so `led on|off` still holds while the drivers are off.
  {
    const bool led_on = pumps_.driverEnabled() && ((now / kStatusLedBlinkHalfPeriodMs) % 2 == 0);
    if (led_on != status_led_on_) {
      status_led_on_ = led_on;
      digitalWrite(pins::kLedStatus, led_on ? HIGH : LOW);
    }
  }
  snapshot.job_busy = top_job_busy;
  snapshot.command_pending = ctx().queue.hasPending();
  snapshot.config_op_pending = ctx().config_queue.hasPending();
  snapshot.config_op_apply_failed = config_op_apply_failed_;
  snapshot.sequence_busy = sequence_.busy();
  snapshot.sequence_step_index = sequence_.busy() ? sequence_.stepIndex() : 0;
  snapshot.sequence_step_count = sequence_.busy() ? sequence_.stepCount() : 0;
  const uint8_t in_step = sequence_.busy() ? coordinator_.dispenseProgressPercent(now) : 0;
  snapshot.sequence_step_progress = in_step;
  snapshot.sequence_progress = sequence_.busy() ? sequence_.progressPercent(in_step) : 0;
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
  snapshot.config_persist_error = store_persist_error_;
  ctx().status.publish(snapshot);

  if (prev_top_job_busy_ && !top_job_busy) {
    ctx().kiosk_job_watchdog_armed.store(false, std::memory_order_relaxed);
    if (prev_sequence_busy_) {
      if (sequence_.cancelled()) {
        armJobTerminal(JobTerminalState::kCancelled, now);
        serial_.emitJobCancelled();
      } else if (sequence_.ok()) {
        armJobTerminal(JobTerminalState::kComplete, now);
        serial_.emitJobEvent(true, JobReject::kNone);
      } else {
        armJobTerminal(JobTerminalState::kError, now, sequence_.lastReject());
        serial_.emitJobEvent(false, sequence_.lastReject());
      }
      sequence_.clearTerminalResult();
      coordinator_.clearTerminalResult();
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

  // Disarm if HTTP cancel cleared a queued job before it became busy.
  if (!top_job_busy && !ctx().queue.hasPending()) {
    ctx().kiosk_job_watchdog_armed.store(false, std::memory_order_relaxed);
  }

  if (job_terminal_ != JobTerminalState::kNone) {
    updateJobTerminalLatch(snapshot, now);
    ctx().status.publish(snapshot);
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
      const bool had_error = store_persist_error_;
      store_persist_error_ = !stores_ok;
      if (store_persist_error_ && !had_error) {
        serial_.emitConfigPersistError();
      }
      if (esp_task_wdt_reset() != ESP_OK) {
        fatalRestart("TWDT reset failed; restarting");
      }
      snapshot.config_dirty = ctx().config.dirty() || ctx().inventory.dirty();
      snapshot.config_persist_error = store_persist_error_;
      ctx().status.publish(snapshot);
    }
  } else if (store_persist_error_ && !ctx().config.dirty() && !ctx().inventory.dirty()) {
    store_persist_error_ = false;
  }

  if (esp_task_wdt_reset() != ESP_OK) {
    fatalRestart("TWDT reset failed; restarting");
  }
}
