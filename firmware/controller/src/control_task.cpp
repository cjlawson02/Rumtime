#include "control_task.h"

#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>

#include "config.h"
#include "config_store.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "gpio_ops.h"
#include "queue_ops.h"
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

// Real HX711 ops for the ScalePlatform seam. Sole HX711 I/O site on the
// ESP32 path (control_task.cpp is excluded from the native build).
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

// NVS-backed config store seam (Preferences). Sole NVS I/O site on the ESP32
// path. putBytes performs the flash write, so it only runs from ConfigStore::
// commit() (idle hook below), never during a pour.
Preferences g_prefs;

bool prefsBegin(const char* ns) {
  return g_prefs.begin(ns, /*readOnly=*/false);
}
bool prefsGetBlob(const char* key, void* out, std::size_t len) {
  if (g_prefs.getBytesLength(key) != len) {
    return false;  // absent or a differently-sized (stale) record -> treat as missing
  }
  return g_prefs.getBytes(key, out, len) == len;
}
bool prefsSetBlob(const char* key, const void* data, std::size_t len) {
  return g_prefs.putBytes(key, data, len) == len;
}
bool prefsCommit() {
  return true;  // Preferences::putBytes already persists to NVS
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
    freertosQueueCreate,
    freertosQueueDestroy,
    freertosQueueSend,
    freertosQueueReceive,
    freertosQueueReset,
    freertosQueuePending,
};

}  // namespace

void ControlTask::begin() {
  // Safe GPIO happens here before the periodic task runs (docs/16 safe boot).
  inputs_.begin();
  pumps_.begin(inputs_, kArduinoGpioOps);
  scale_.begin(kHx711Ops);
  config_.begin(kPrefsOps);  // per-pump calibration + bindings from NVS (or seed defaults)
  if (!queue_.begin(kFreeRtosQueueOps)) {
    fatalRestart("command queue alloc failed; restarting");
  }
  coordinator_.begin(pumps_, scale_, config_);
  status_.begin();
  serial_.begin(queue_, status_, config_);
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
    // Arduino core may have initialized TWDT already — subscribe this task only.
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

void ControlTask::tick() {
  // Tick order per docs/16. Read inputs first so serial preflight sees live cutoff.
  const unsigned long now = millis();

  inputs_.tick();
  StatusSnapshot preflight_status = status_.read();
  preflight_status.cutoff_open = inputs_.cutoffOpen();

  serial_.poll(&preflight_status);  // enqueue-only, non-blocking; never touches pumps/scale

  if (queue_.drainCancel()) {
    coordinator_.cancel();
  }
  pumps_.tick();     // stopAll() if cutoff open; sole motor output path
  scale_.tick(now);  // non-blocking HX711 FSM

  Command command;
  if (queue_.drainCommand(command) && command.type == CommandType::kDispensePump) {
    if (!coordinator_.startDispense(command.dispense, now)) {
      serial_.emitJobEvent(false, coordinator_.lastReject());
    }
  }
  coordinator_.tick(now);

  StatusSnapshot snapshot;
  snapshot.cutoff_open = pumps_.cutoffOpen();
  snapshot.pumps_running = pumps_.anyRunning();
  snapshot.scale_ready = scale_.ready();
  snapshot.grams = scale_.readFilteredGrams();
  snapshot.flow_detected = scale_.flowDetected();
  snapshot.flow_timed_out = scale_.flowTimedOut();
  snapshot.last_delta_g = scale_.lastDeltaG();
  snapshot.job_busy = coordinator_.busy();
  snapshot.command_pending = queue_.hasPending();
  snapshot.job_ok = coordinator_.ok();
  snapshot.job_error = coordinator_.error();
  snapshot.job_cancelled = coordinator_.cancelled();
  snapshot.job_phase = static_cast<uint8_t>(coordinator_.phase());
  snapshot.job_reject = coordinator_.lastReject();
  snapshot.config_dirty = config_.dirty();
  snapshot.config_persist_error = config_persist_error_;
  status_.publish(snapshot);

  if (prev_job_busy_ && !snapshot.job_busy) {
    if (snapshot.job_cancelled) {
      serial_.emitJobCancelled();
    } else if (snapshot.job_ok || snapshot.job_error) {
      serial_.emitJobEvent(snapshot.job_ok, snapshot.job_reject);
    }
  }
  prev_job_busy_ = snapshot.job_busy;

  // Idle-only NVS commit (docs/16: never flash-write on the motion path). Feed
  // TWDT around the blocking flash write. On failure, retry with backoff and
  // surface // config:error once per failure episode.
  if (!snapshot.job_busy && config_.dirty()) {
    if ((now - last_config_commit_attempt_ms_) >= kConfigCommitRetryMs) {
      last_config_commit_attempt_ms_ = now;
      if (esp_task_wdt_reset() != ESP_OK) {
        fatalRestart("TWDT reset failed; restarting");
      }
      if (config_.commit([]() {
            if (esp_task_wdt_reset() != ESP_OK) {
              fatalRestart("TWDT reset failed; restarting");
            }
          })) {
        config_persist_error_ = false;
      } else {
        if (!config_persist_error_) {
          serial_.emitConfigPersistError();
        }
        config_persist_error_ = true;
      }
      if (esp_task_wdt_reset() != ESP_OK) {
        fatalRestart("TWDT reset failed; restarting");
      }
      snapshot.config_dirty = config_.dirty();
      snapshot.config_persist_error = config_persist_error_;
      status_.publish(snapshot);
    }
  } else if (config_persist_error_ && !config_.dirty()) {
    // A successful commit elsewhere cleared dirty; clear the fault latch too.
    config_persist_error_ = false;
  }

  if (esp_task_wdt_reset() != ESP_OK) {
    fatalRestart("TWDT reset failed; restarting");
  }
}
