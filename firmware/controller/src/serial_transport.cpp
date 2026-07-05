#include "serial_transport.h"

#include <Arduino.h>

#include <cstring>

#include "command_queue.h"
#include "command_validate.h"
#include "config_store.h"
#include "pump_bus.h"
#include "status_snapshot.h"

void SerialTransport::begin(CommandQueue& queue, StatusPublisher& status, ConfigStore& config) {
  queue_ = &queue;
  status_ = &status;
  config_ = &config;
  Serial.begin(115200);
  len_ = 0;
  overflow_ = false;
  cancel_pending_this_poll_ = false;
}

void SerialTransport::poll(const StatusSnapshot* status_override) {
  cancel_pending_this_poll_ = false;
  size_t bytes_read = 0;
  // Non-blocking: cap work per tick so a serial flood cannot starve motion.
  while (Serial.available() > 0 && bytes_read < kMaxBytesPerPoll) {
    const char c = static_cast<char>(Serial.read());
    ++bytes_read;
    if (c == '\n' || c == '\r') {
      if (overflow_) {
        Serial.println(commandRejectText(CommandReject::kLineTooLong));
      } else if (len_ > 0) {
        line_[len_] = '\0';
        handleLine(line_, status_override);
      }
      len_ = 0;
      overflow_ = false;
      continue;
    }
    if (len_ + 1 < kLineMax) {
      line_[len_++] = c;
    } else {
      overflow_ = true;  // drop the rest of an over-long line
    }
  }
}

void SerialTransport::handleLine(char* line, const StatusSnapshot* status_override) {
  const StatusSnapshot status =
      status_override != nullptr ? *status_override : status_->read();

  const CommandParseResult parsed =
      parseCommandLine(line, status, PumpBus::kNumChannels, *config_,
                       cancel_pending_this_poll_);

  if (parsed.is_cancel) {
    queue_->enqueueCancel();
    cancel_pending_this_poll_ = true;
    Serial.println("ok");
    return;
  }

  if (parsed.is_status) {
    printStatus();
    return;
  }

  if (parsed.reject != CommandReject::kNone) {
    Serial.println(commandRejectText(parsed.reject));
    return;
  }

  if (parsed.config_op.type != ConfigOpType::kNone) {
    if (queue_->hasPending()) {
      Serial.println(commandRejectText(CommandReject::kBusy));
      return;
    }
    applyConfigOp(parsed.config_op);
    return;
  }

  if (parsed.command.type == CommandType::kPrimeStop) {
    if (queue_->enqueuePrimeStop()) {
      Serial.println("ok");
    } else {
      Serial.println("busy");
    }
    return;
  }

  if (parsed.command.type == CommandType::kPrimePump) {
    if (queue_->enqueuePrime(parsed.command.prime)) {
      if (cancel_pending_this_poll_) {
        queue_->markDispenseAfterCancel();
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
    if (cancel_pending_this_poll_) {
      queue_->markDispenseAfterCancel();
    }
    Serial.println("ok");
  } else {
    Serial.println("busy");  // depth-1 slot full: a job is already pending
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

void SerialTransport::applyConfigOp(const ConfigOp& op) {
  bool ok = false;
  switch (op.type) {
    case ConfigOpType::kDump:
      printConfig();
      return;
    case ConfigOpType::kSetCalibration: {
      // Keep the existing anti-drip when the operator omitted it (cal <pump> <ml/s>).
      const uint32_t anti_drip =
          op.has_anti_drip ? op.anti_drip_ms : config_->antiDripMs(op.channel);
      ok = config_->setCalibration(op.channel, op.ml_per_s, anti_drip);
      Serial.println(ok ? "ok" : commandRejectText(CommandReject::kBadCalibration));
      return;
    }
    case ConfigOpType::kSetBinding:
      ok = config_->setBinding(op.channel, op.ingredient_id);
      Serial.println(ok ? "ok" : commandRejectText(CommandReject::kBadIngredient));
      return;
    case ConfigOpType::kClearBinding:
      config_->clearBinding(op.channel);
      Serial.println("ok");
      return;
    case ConfigOpType::kNone:
    default:
      return;
  }
}

void SerialTransport::printConfig() {
  // Only the physically controllable channels; the NVS record is sized larger
  // (kMaxPumps) for future I2C modules but the coordinator addresses these.
  for (uint8_t ch = 0; ch < PumpBus::kNumChannels; ++ch) {
    Serial.print("config pump=");
    Serial.print(ch + 1);  // 1-based on the wire
    Serial.print(" ml_per_s=");
    Serial.print(config_->mlPerSecond(ch), 3);
    Serial.print(" anti_drip_ms=");
    Serial.print(config_->antiDripMs(ch));
    Serial.print(" bound=");
    Serial.print(config_->bound(ch) ? 1 : 0);
    Serial.print(" ingredient=");
    const char* ingredient = config_->ingredient(ch);
    Serial.println(ingredient[0] == '\0' ? "-" : ingredient);
  }
}

void SerialTransport::printStatus() {
  const StatusSnapshot s = status_->read();
  Serial.print("status cutoff_open=");
  Serial.print(s.cutoff_open ? 1 : 0);
  Serial.print(" pumps_running=");
  Serial.print(s.pumps_running ? 1 : 0);
  Serial.print(" scale_ready=");
  Serial.print(s.scale_ready ? 1 : 0);
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
  Serial.print(" config_dirty=");
  Serial.print(s.config_dirty ? 1 : 0);
  Serial.print(" config_persist_error=");
  Serial.println(s.config_persist_error ? 1 : 0);
}
