#include "device_status.h"

#include <cmath>
#include <cstdio>
#include <cstring>

#include "command_validate.h"
#include "config.h"

namespace {

void appendEscapedString(std::string& out, const char* value) {
  out.push_back('"');
  if (value != nullptr) {
    for (const char* p = value; *p != '\0'; ++p) {
      if (*p == '"' || *p == '\\') {
        out.push_back('\\');
      }
      out.push_back(*p);
    }
  }
  out.push_back('"');
}

void appendKeyString(std::string& out, const char* key, const char* value, bool comma = true) {
  out.push_back('"');
  out.append(key);
  out.append("\":");
  appendEscapedString(out, value);
  if (comma) {
    out.push_back(',');
  }
}

void appendKeyBool(std::string& out, const char* key, bool value, bool comma = true) {
  char buf[64];
  std::snprintf(buf, sizeof(buf), "\"%s\":%s", key, value ? "true" : "false");
  out.append(buf);
  if (comma) {
    out.push_back(',');
  }
}

void appendKeyInt(std::string& out, const char* key, int value, bool comma = true) {
  char buf[64];
  std::snprintf(buf, sizeof(buf), "\"%s\":%d", key, value);
  out.append(buf);
  if (comma) {
    out.push_back(',');
  }
}

void appendKeyFloat(std::string& out, const char* key, float value, bool comma = true) {
  char buf[64];
  std::snprintf(buf, sizeof(buf), "\"%s\":%.3f", key, value);
  out.append(buf);
  if (comma) {
    out.push_back(',');
  }
}

const char* purposeName(PumpJobPurposeWire purpose) {
  switch (purpose) {
    case PumpJobPurposeWire::kPrime:
      return "prime";
    case PumpJobPurposeWire::kCalibration:
      return "calibration";
    case PumpJobPurposeWire::kVerify:
      return "verify";
    default:
      return "prime";
  }
}

void appendNotifications(std::string& out, const StatusSnapshot& s) {
  out.append("\"notifications\":[");
  bool first = true;
  auto add = [&](const char* id, const char* severity, const char* title, const char* message) {
    if (!first) {
      out.push_back(',');
    }
    first = false;
    out.push_back('{');
    appendKeyString(out, "id", id);
    appendKeyString(out, "severity", severity);
    appendKeyString(out, "title", title);
    appendKeyString(out, "message", message, false);
    out.push_back('}');
  };

  if (!s.scale_ready) {
    add("scale_not_ready", "warning", "Scale not ready",
        "Place an empty glass on the platform.");
  }
  if (s.config_persist_error) {
    add("config_persist_error", "error", "Config save failed",
        "Machine settings could not be saved to flash.");
  }
  if (s.config_op_apply_failed) {
    add("config_op_failed", "error", "Config update failed",
        "The last configuration change was rejected.");
  }
  if (s.cutoff_open) {
    add("cutoff_open", "error", "Pump cutoff open", "Close the hardware cutoff switch.");
  }
  if (s.flow_timed_out) {
    add("flow_timeout", "warning", "Flow not detected", "No flow detected during pour.");
  }
  if (s.job_error && s.job_reject != JobReject::kNone) {
    add("job_reject", "warning", "Last job failed", jobRejectText(s.job_reject));
  }
  out.append("]");
}

void appendPumpJobJson(std::string& out, const StatusSnapshot& s, unsigned long now_ms) {
  out.append("\"pumpJob\":{");
  appendKeyInt(out, "pumpId", static_cast<int>(s.pump_job_pump_id));
  const auto purpose = static_cast<PumpJobPurposeWire>(s.pump_job_purpose);
  appendKeyString(out, "purpose", purposeName(purpose));
  appendKeyString(out, "state", "running");
  if (purpose == PumpJobPurposeWire::kPrime) {
    appendKeyInt(out, "progress", 0);
    appendKeyString(out, "stepLabel", pumpJobStepLabel(purpose));
    appendKeyBool(out, "continuous", true);
    const unsigned long elapsed_s =
        s.pump_job_start_ms > 0 && now_ms >= s.pump_job_start_ms
            ? (now_ms - s.pump_job_start_ms) / 1000UL
            : 0UL;
    appendKeyInt(out, "elapsedSeconds", static_cast<int>(elapsed_s), false);
  } else {
    const unsigned long elapsed =
        s.pump_job_start_ms > 0 && now_ms >= s.pump_job_start_ms ? now_ms - s.pump_job_start_ms
                                                                 : 0UL;
    appendKeyInt(out, "progress",
                 computeTimedPumpProgressPercent(elapsed, s.pump_job_duration_ms));
    appendKeyString(out, "stepLabel", pumpJobStepLabel(purpose));
    if (purpose == PumpJobPurposeWire::kVerify && s.pump_job_target_ml > 0.0f) {
      appendKeyFloat(out, "targetMl", s.pump_job_target_ml, false);
    } else if (purpose == PumpJobPurposeWire::kCalibration && s.pump_job_duration_ms > 0) {
      appendKeyInt(out, "durationSeconds",
                   static_cast<int>((s.pump_job_duration_ms + 999UL) / 1000UL), false);
    } else if (!out.empty() && out.back() == ',') {
      out.pop_back();
    }
  }
  out.append("},");
}

}  // namespace

int computeSequenceProgressPercent(uint8_t step_index, uint8_t step_count) {
  if (step_count == 0) {
    return 0;
  }
  const int pct = (static_cast<int>(step_index) * 100) / static_cast<int>(step_count);
  return pct < 0 ? 0 : (pct > 100 ? 100 : pct);
}

int computeTimedPumpProgressPercent(unsigned long elapsed_ms, unsigned long duration_ms) {
  if (duration_ms == 0) {
    return 0;
  }
  const unsigned long clamped = elapsed_ms > duration_ms ? duration_ms : elapsed_ms;
  const int pct = static_cast<int>((clamped * 100UL) / duration_ms);
  return pct > 100 ? 100 : pct;
}

const char* pourStepLabel(const char* ingredient_id) {
  static char buf[200];
  if (ingredient_id == nullptr || ingredient_id[0] == '\0') {
    return "Pouring…";
  }
  std::snprintf(buf, sizeof(buf), "Pouring %s…", ingredient_id);
  return buf;
}

const char* pumpJobStepLabel(PumpJobPurposeWire purpose) {
  switch (purpose) {
    case PumpJobPurposeWire::kPrime:
      return "Priming line…";
    case PumpJobPurposeWire::kCalibration:
      return "Calibration run…";
    case PumpJobPurposeWire::kVerify:
      return "Verify dispense…";
    default:
      return "Pump running…";
  }
}

std::string buildDeviceStatusJson(const DeviceStatusInputs& in) {
  std::string out;
  out.reserve(2048);
  if (in.snapshot == nullptr) {
    return "{}";
  }
  const StatusSnapshot& s = *in.snapshot;

  out.push_back('{');
  appendKeyBool(out, "connected", in.wifi_connected);
  appendKeyString(out, "firmwareVersion", in.firmware_version);
  appendKeyString(out, "hostname", in.hostname);

  out.append("\"bindings\":{");
  for (uint8_t i = 0; i < s.published_binding_count; ++i) {
    if (i > 0) {
      out.push_back(',');
    }
    const SnapshotBinding& b = s.published_bindings[i];
    out.push_back('"');
    out.append(b.ingredient_id);
    out.append("\":{");
    appendKeyString(out, "ingredientId", b.ingredient_id);
    appendKeyFloat(out, "remainingMl", b.remaining_ml);
    appendKeyFloat(out, "bottleSizeMl", b.bottle_size_ml);
    appendKeyBool(out, "primed", b.primed, false);
    out.append("}");
  }
  out.append("},");

  out.append("\"pumps\":[");
  for (uint8_t i = 0; i < s.published_pump_count; ++i) {
    if (i > 0) {
      out.push_back(',');
    }
    const SnapshotPump& p = s.published_pumps[i];
    out.push_back('{');
    appendKeyInt(out, "pumpId", static_cast<int>(p.pump_id));
    if (p.bound && p.ingredient_id[0] != '\0') {
      appendKeyString(out, "ingredientId", p.ingredient_id);
    } else {
      out.append("\"ingredientId\":null,");
    }
    appendKeyFloat(out, "mlPerSecond", p.ml_per_second);
    appendKeyInt(out, "antiDripMs", static_cast<int>(p.anti_drip_ms), false);
    out.push_back('}');
  }
  out.append("],");

  if (s.sequence_busy) {
    out.append("\"job\":{");
    appendKeyString(out, "recipeId",
                    s.active_recipe_id[0] != '\0' ? s.active_recipe_id : "pour");
    appendKeyString(out, "state", "pouring");
    appendKeyInt(out, "progress",
                 computeSequenceProgressPercent(s.sequence_step_index, s.sequence_step_count));
    appendKeyString(out, "stepLabel", pourStepLabel(s.sequence_ingredient), false);
    out.append("},");
    out.append("\"pumpJob\":null,");
  } else if (s.job_terminal == JobTerminalState::kComplete ||
             s.job_terminal == JobTerminalState::kCancelled) {
    out.append("\"job\":{");
    appendKeyString(out, "recipeId",
                    s.terminal_recipe_id[0] != '\0' ? s.terminal_recipe_id : "pour");
    appendKeyString(out, "state",
                    s.job_terminal == JobTerminalState::kComplete ? "complete" : "cancelled");
    appendKeyInt(out, "progress", s.job_terminal == JobTerminalState::kComplete ? 100 : 0);
    appendKeyString(out, "stepLabel",
                    s.job_terminal == JobTerminalState::kComplete ? "Pour complete"
                                                                  : "Pour cancelled",
                    false);
    out.append("},");
    out.append("\"pumpJob\":null,");
  } else if (s.job_busy && s.pump_job_pump_id > 0) {
    out.append("\"job\":null,");
    appendPumpJobJson(out, s, in.now_ms);
  } else {
    out.append("\"job\":null,");
    out.append("\"pumpJob\":null,");
  }

  appendNotifications(out, s);
  out.push_back('}');
  return out;
}
