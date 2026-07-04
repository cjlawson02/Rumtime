#include "serial_transport.h"

#include <Arduino.h>

#include <cstring>

#include "command_queue.h"
#include "command_validate.h"
#include "pump_bus.h"
#include "status_snapshot.h"

void SerialTransport::begin(CommandQueue& queue, StatusPublisher& status) {
  queue_ = &queue;
  status_ = &status;
  Serial.begin(115200);
  len_ = 0;
  overflow_ = false;
  cancel_pending_this_poll_ = false;
}

void SerialTransport::poll() {
  cancel_pending_this_poll_ = false;
  // Non-blocking: consume only the bytes already buffered this tick.
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      if (overflow_) {
        Serial.println(commandRejectText(CommandReject::kLineTooLong));
      } else if (len_ > 0) {
        line_[len_] = '\0';
        handleLine(line_);
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

void SerialTransport::handleLine(char* line) {
  const CommandParseResult parsed =
      parseCommandLine(line, status_->read(), PumpBus::kNumChannels, cancel_pending_this_poll_);

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

  if (parsed.command.type != CommandType::kDispensePump) {
    return;
  }

  if (queue_->enqueueDispense(parsed.command.dispense)) {
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
  Serial.print(" job_ok=");
  Serial.print(s.job_ok ? 1 : 0);
  Serial.print(" job_error=");
  Serial.print(s.job_error ? 1 : 0);
  Serial.print(" job_phase=");
  Serial.print(s.job_phase);
  Serial.print(" job_reject=");
  Serial.println(jobRejectText(s.job_reject));
}
