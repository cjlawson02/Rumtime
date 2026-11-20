#include "serial_transport.h"

#include <Arduino.h>

#include <cstring>

#include "command_queue.h"
#include "command_validate.h"
#include "config.h"
#include "config_store.h"
#include "http_validate.h"
#include "network_task.h"
#include "pump_bus.h"
#include "runtime_context.h"
#include "status_snapshot.h"
#include "wifi_manager.h"

void SerialTransport::begin(CommandQueue& queue, ConfigStore& config, InventoryStore& inventory,
                            ConfigOpQueue& config_queue, PumpBus& pumps) {
  queue_ = &queue;
  config_ = &config;
  inventory_ = &inventory;
  config_queue_ = &config_queue;
  pumps_ = &pumps;
  Serial.begin(115200);
  len_ = 0;
  overflow_ = false;
  cancel_pending_this_poll_ = false;
  command_enqueued_this_poll_ = false;
}

void SerialTransport::poll(const StatusSnapshot& status) {
  cancel_pending_this_poll_ = false;
  command_enqueued_this_poll_ = false;
  size_t bytes_read = 0;
  while (Serial.available() > 0 && bytes_read < kMaxBytesPerPoll) {
    const char c = static_cast<char>(Serial.read());
    ++bytes_read;
    if (c == '\n' || c == '\r') {
      if (overflow_) {
        Serial.println(commandRejectText(CommandReject::kLineTooLong));
      } else if (len_ > 0) {
        line_[len_] = '\0';
        handleLine(line_, status);
      }
      len_ = 0;
      overflow_ = false;
      continue;
    }
    if (len_ + 1 < kLineMax) {
      line_[len_++] = c;
    } else {
      overflow_ = true;
    }
  }
}

bool SerialTransport::handleWifiCommand(char* line) {
  char* verb = std::strtok(line, " \t");
  if (verb == nullptr || std::strcmp(verb, "wifi") != 0) {
    return false;
  }
  char* sub = strtok(nullptr, " \t");
  WiFiManager& wifi = networkWiFiManager();
  if (sub == nullptr) {
    Serial.println("Error:usage wifi status|ssid|pass|save|clear");
    return true;
  }
  if (strcmp(sub, "status") == 0) {
    const WiFiStatus st = wifi.status();
    Serial.print("wifi connected=");
    Serial.print(st.connected ? 1 : 0);
    Serial.print(" ssid=");
    Serial.print(st.ssid[0] != '\0' ? st.ssid : "-");
    Serial.print(" ip=");
    Serial.print(st.ip[0] != '\0' ? st.ip : "-");
    Serial.print(" rssi=");
    Serial.print(st.rssi);
    Serial.print(" hostname=");
    Serial.println(kMdnsHostFqdn);
    return true;
  }
  if (strcmp(sub, "ssid") == 0) {
    char* arg = strtok(nullptr, "\r\n");
    if (arg == nullptr) {
      Serial.println("Error:usage wifi ssid <ssid>");
      return true;
    }
    wifi.stageSsid(arg);
    Serial.println("ok");
    return true;
  }
  if (strcmp(sub, "pass") == 0) {
    char* arg = strtok(nullptr, "\r\n");
    if (arg == nullptr) {
      Serial.println("Error:usage wifi pass <password>");
      return true;
    }
    wifi.stagePassword(arg);
    Serial.println("ok");
    return true;
  }
  if (strcmp(sub, "save") == 0) {
    if (strtok(nullptr, " \t") != nullptr) {
      Serial.println("Error:bad args");
      return true;
    }
    Serial.println(wifi.saveCredentials() ? "ok" : "Error:wifi save failed");
    return true;
  }
  if (strcmp(sub, "clear") == 0) {
    if (strtok(nullptr, " \t") != nullptr) {
      Serial.println("Error:bad args");
      return true;
    }
    wifi.clearCredentials();
    Serial.println("ok");
    return true;
  }
  Serial.println("Error:unknown wifi command");
  return true;
}

bool SerialTransport::handleBringupCommand(char* line, const StatusSnapshot& status) {
  char* verb = std::strtok(line, " \t");
  if (verb == nullptr) {
    return false;
  }
  const bool is_led = std::strcmp(verb, "led") == 0;
  const bool is_stby = std::strcmp(verb, "stby") == 0;
  const bool is_bypass = std::strcmp(verb, "scale-bypass") == 0;
  if (!is_led && !is_stby && !is_bypass) {
    return false;
  }
  const char* usage = is_led    ? "Error:usage led on|off"
                      : is_stby ? "Error:usage stby on|off"
                                : "Error:usage scale-bypass on|off";
  char* arg = std::strtok(nullptr, " \t");
  if (arg == nullptr || std::strtok(nullptr, " \t") != nullptr) {
    Serial.println(usage);
    return true;
  }
  const bool on = std::strcmp(arg, "on") == 0;
  const bool off = std::strcmp(arg, "off") == 0;
  if (!on && !off) {
    Serial.println(usage);
    return true;
  }
  if (is_led) {
    digitalWrite(pins::kLedStatus, on ? HIGH : LOW);
    Serial.println("ok");
    return true;
  }
  if (is_bypass) {
    if (status.job_busy || status.sequence_busy || status.command_pending) {
      Serial.println("busy");
      return true;
    }
    runtimeContext().bench_scale_bypass.store(on, std::memory_order_relaxed);
    Serial.println(on ? "ok scale-bypass ON (bench only; cleared on reboot)" : "ok");
    return true;
  }
  if (pumps_ == nullptr) {
    Serial.println("Error:stby unavailable");
    return true;
  }
  // Bring-up only: never toggle STBY under a job (it would stop or strand motion
  // the coordinator still believes is running).
  if (status.job_busy || status.sequence_busy || status.command_pending || status.pumps_running) {
    Serial.println("busy");
    return true;
  }
  if (!pumps_->setDriverEnabled(on)) {
    Serial.println("Error:stby refused (pump module fault)");
    return true;
  }
  Serial.println("ok");
  return true;
}

void SerialTransport::handleLine(char* line, const StatusSnapshot& status) {
  if (std::strncmp(line, "wifi", 4) == 0 &&
      (line[4] == '\0' || line[4] == ' ' || line[4] == '\t')) {
    handleWifiCommand(line);
    return;
  }
  if ((std::strncmp(line, "led", 3) == 0 &&
       (line[3] == '\0' || line[3] == ' ' || line[3] == '\t')) ||
      (std::strncmp(line, "stby", 4) == 0 &&
       (line[4] == '\0' || line[4] == ' ' || line[4] == '\t')) ||
      (std::strncmp(line, "scale-bypass", 12) == 0 &&
       (line[12] == '\0' || line[12] == ' ' || line[12] == '\t'))) {
    handleBringupCommand(line, status);
    return;
  }

  const CommandParseResult parsed = parseCommandLine(line, status, PumpBus::kNumChannels, *config_,
                                                     *inventory_, cancel_pending_this_poll_);

  if (parsed.is_cancel) {
    if (command_enqueued_this_poll_) {
      queue_->markCommandAfterCancel();
    }
    queue_->enqueueCancel();
    cancel_pending_this_poll_ = true;
    Serial.println("ok");
    return;
  }

  if (parsed.is_status) {
    printStatus(status);
    return;
  }

  if (parsed.reject != CommandReject::kNone) {
    Serial.println(commandRejectText(parsed.reject));
    return;
  }

  if (parsed.config_op.type != ConfigOpType::kNone) {
    if (parsed.config_op.type == ConfigOpType::kDump) {
      printConfig();
      return;
    }
    if (config_queue_->hasPending()) {
      Serial.println("busy");
      return;
    }
    const ConfigOpReject reject =
        preflightConfigOpEnqueue(parsed.config_op, status, PumpBus::kNumChannels);
    if (reject != ConfigOpReject::kNone) {
      Serial.println(reject == ConfigOpReject::kBusy ? "busy"
                                                     : commandRejectText(CommandReject::kBadArgs));
      return;
    }
    if (!config_queue_->enqueue(parsed.config_op)) {
      Serial.println("busy");
    } else {
      Serial.println("ok");
    }
    return;
  }

  if (parsed.command.type == CommandType::kPrimeStop) {
    queue_->enqueuePrimeStop();
    command_enqueued_this_poll_ = true;
    Serial.println("ok");
    return;
  }

  if (parsed.command.type == CommandType::kPrimePump) {
    if (queue_->enqueuePrime(parsed.command.prime)) {
      command_enqueued_this_poll_ = true;
      if (cancel_pending_this_poll_) {
        queue_->markCommandAfterCancel();
      }
      Serial.println("ok");
    } else {
      Serial.println("busy");
    }
    return;
  }

  if (parsed.command.type == CommandType::kPourSequence) {
    if (queue_->enqueuePourSequence(parsed.command.pour_sequence)) {
      command_enqueued_this_poll_ = true;
      if (cancel_pending_this_poll_) {
        queue_->markCommandAfterCancel();
      }
      Serial.println("ok");
    } else {
      Serial.println("busy");
    }
    return;
  }

  if (parsed.command.type != CommandType::kDispensePump) {
    return;
  }

  DispenseCommand cmd = parsed.command.dispense;
  cmd.ml_per_s = config_->mlPerSecond(cmd.channel);
  cmd.anti_drip_ms = config_->antiDripMs(cmd.channel);

  if (queue_->enqueueDispense(cmd)) {
    command_enqueued_this_poll_ = true;
    if (cancel_pending_this_poll_) {
      queue_->markCommandAfterCancel();
    }
    Serial.println("ok");
  } else {
    Serial.println("busy");
  }
}

void SerialTransport::emitJobEvent(bool ok, JobReject reject) {
  if (ok) {
    Serial.println("// job:ok");
    return;
  }
  Serial.print("// job:error reject=");
  Serial.println(jobRejectText(reject));
}

void SerialTransport::emitJobCancelled() {
  Serial.println("// job:cancelled");
}

void SerialTransport::emitConfigPersistError() {
  Serial.println("// config:error persist failed");
}

void SerialTransport::emitStackLow(uint32_t control_free, uint32_t network_free) {
  Serial.print("// stack:low control_free=");
  Serial.print(control_free);
  Serial.print(" network_free=");
  Serial.println(network_free);
}

void SerialTransport::printConfig() {
  for (uint8_t ch = 0; ch < PumpBus::kNumChannels; ++ch) {
    Serial.print("config pump=");
    Serial.print(ch + 1);
    Serial.print(" ml_per_s=");
    Serial.print(config_->mlPerSecond(ch), 3);
    Serial.print(" anti_drip_ms=");
    Serial.print(config_->antiDripMs(ch));
    Serial.print(" bound=");
    Serial.print(config_->bound(ch) ? 1 : 0);
    Serial.print(" polarity=");
    Serial.print(config_->invertPolarity(ch) ? "invert" : "normal");
    Serial.print(" present=");
    Serial.print(pumps_ != nullptr && pumps_->channelPresent(ch) ? 1 : 0);
    Serial.print(" ingredient=");
    const char* ingredient = config_->ingredient(ch);
    Serial.println(ingredient[0] == '\0' ? "-" : ingredient);
  }
}

void SerialTransport::printStatus(const StatusSnapshot& s) {
  Serial.print("status pumps_running=");
  Serial.print(s.pumps_running ? 1 : 0);
  Serial.print(" scale_ready=");
  Serial.print(s.scale_ready ? 1 : 0);
  if (s.scale_bypass) {
    Serial.print(" scale_bypass=1");
  }
  Serial.print(" grams=");
  Serial.print(s.grams, 2);
  Serial.print(" flow_detected=");
  Serial.print(s.flow_detected ? 1 : 0);
  Serial.print(" flow_timed_out=");
  Serial.print(s.flow_timed_out ? 1 : 0);
  Serial.print(" job_busy=");
  Serial.print(s.job_busy ? 1 : 0);
  Serial.print(" command_pending=");
  Serial.print(s.command_pending ? 1 : 0);
  Serial.print(" job_ok=");
  Serial.print(s.job_ok ? 1 : 0);
  Serial.print(" job_error=");
  Serial.print(s.job_error ? 1 : 0);
  Serial.print(" job_cancelled=");
  Serial.print(s.job_cancelled ? 1 : 0);
  Serial.print(" job_phase=");
  Serial.print(s.job_phase);
  Serial.print(" job_reject=");
  Serial.print(jobRejectText(s.job_reject));
  Serial.print(" sequence_busy=");
  Serial.print(s.sequence_busy ? 1 : 0);
  Serial.print(" sequence_step=");
  Serial.print(s.sequence_step_index);
  Serial.print(" sequence_ingredient=");
  Serial.print(s.sequence_ingredient[0] == '\0' ? "-" : s.sequence_ingredient);
  Serial.print(" config_dirty=");
  Serial.print(s.config_dirty ? 1 : 0);
  Serial.print(" config_persist_error=");
  Serial.print(s.config_persist_error ? 1 : 0);
  Serial.print(" stack_free_control=");
  Serial.print(s.control_stack_free);
  Serial.print(" stack_free_network=");
  Serial.println(s.network_stack_free);
}
