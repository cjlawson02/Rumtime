#include "command_validate.h"

#include <cmath>
#include <cstdlib>
#include <cstring>

#include "config.h"
#include "config_store.h"
#include "coordinator.h"

namespace {

CommandReject validateDispenseParams(const DispenseCommand& cmd, uint8_t num_pumps, float ml_per_s) {
  unsigned long pour_ms = 0;
  CommandReject reject = CommandReject::kNone;
  if (!computePourDurationMs(cmd, num_pumps, ml_per_s, &pour_ms, &reject)) {
    return reject;
  }
  return CommandReject::kNone;
}

}  // namespace

const char* commandRejectText(CommandReject reject) {
  switch (reject) {
    case CommandReject::kNone:
      return "";
    case CommandReject::kUnknownCommand:
      return "Error:unknown command";
    case CommandReject::kUsage:
      return "Error:usage dispense [open] <pump> <ml>";
    case CommandReject::kBadArgs:
      return "Error:bad args";
    case CommandReject::kBadPump:
      return "Error:bad pump";
    case CommandReject::kBadMl:
      return "Error:bad ml";
    case CommandReject::kPourTooLong:
      return "Error:pour too long";
    case CommandReject::kSubResolutionMl:
      return "Error:sub-resolution ml";
    case CommandReject::kCutoffOpen:
      return "Error:cutoff open";
    case CommandReject::kScaleNotReady:
      return "Error:scale not ready";
    case CommandReject::kBusy:
      return "busy";
    case CommandReject::kLineTooLong:
      return "Error:line too long";
    case CommandReject::kBadCalibration:
      return "Error:bad calibration";
    case CommandReject::kBadIngredient:
      return "Error:bad ingredient";
    case CommandReject::kPrimeUsage:
      return "Error:usage prime <pump> | prime stop";
  }
  return "Error:unknown";
}

const char* jobRejectText(JobReject reject) {
  switch (reject) {
    case JobReject::kNone:
      return "none";
    case JobReject::kBusy:
      return "busy";
    case JobReject::kCutoffOpen:
      return "cutoff-open";
    case JobReject::kBadChannel:
      return "bad-channel";
    case JobReject::kBadMl:
      return "bad-ml";
    case JobReject::kPourTooLong:
      return "pour-too-long";
    case JobReject::kSubResolutionMl:
      return "sub-resolution-ml";
    case JobReject::kPumpRefused:
      return "pump-refused";
    case JobReject::kFlowTimeout:
      return "flow-timeout";
    case JobReject::kScaleFault:
      return "scale-fault";
    case JobReject::kScaleNotReady:
      return "scale-not-ready";
    case JobReject::kCutoffMidJob:
      return "cutoff-mid-job";
    case JobReject::kPrimeTimeout:
      return "prime-timeout";
  }
  return "unknown";
}

bool validateDispenseCommand(const DispenseCommand& cmd, uint8_t num_pumps, float max_ml) {
  if (cmd.channel >= num_pumps) {
    return false;
  }
  if (!std::isfinite(cmd.ml) || cmd.ml <= 0.0f || cmd.ml > max_ml) {
    return false;
  }
  return true;
}

bool computePourDurationMs(const DispenseCommand& cmd, uint8_t num_pumps, float ml_per_s,
                             unsigned long* pour_ms_out, CommandReject* reject_out) {
  auto fail = [&](CommandReject reject) {
    if (reject_out != nullptr) {
      *reject_out = reject;
    }
    return false;
  };
  if (pour_ms_out == nullptr) {
    return fail(CommandReject::kBadArgs);
  }
  if (cmd.channel >= num_pumps) {
    return fail(CommandReject::kBadPump);
  }
  if (!std::isfinite(cmd.ml) || cmd.ml <= 0.0f || cmd.ml > kMaxDispenseMl) {
    return fail(CommandReject::kBadMl);
  }
  if (!std::isfinite(ml_per_s) || ml_per_s <= 0.0f) {
    return fail(CommandReject::kBadCalibration);
  }
  const float pour_ms_f = (cmd.ml / ml_per_s) * 1000.0f;
  if (!std::isfinite(pour_ms_f) || pour_ms_f <= 0.0f) {
    return fail(CommandReject::kSubResolutionMl);
  }
  if (pour_ms_f > static_cast<float>(kMaxPourDurationMs)) {
    return fail(CommandReject::kPourTooLong);
  }
  const unsigned long pour_ms = static_cast<unsigned long>(pour_ms_f + 0.5f);
  if (pour_ms == 0) {
    return fail(CommandReject::kSubResolutionMl);
  }
  *pour_ms_out = pour_ms;
  if (reject_out != nullptr) {
    *reject_out = CommandReject::kNone;
  }
  return true;
}

JobReject commandRejectToJobReject(CommandReject reject) {
  switch (reject) {
    case CommandReject::kBadPump:
      return JobReject::kBadChannel;
    case CommandReject::kBadMl:
      return JobReject::kBadMl;
    case CommandReject::kPourTooLong:
      return JobReject::kPourTooLong;
    case CommandReject::kSubResolutionMl:
      return JobReject::kSubResolutionMl;
    case CommandReject::kCutoffOpen:
      return JobReject::kCutoffOpen;
    case CommandReject::kScaleNotReady:
      return JobReject::kScaleNotReady;
    case CommandReject::kBusy:
      return JobReject::kBusy;
    default:
      return JobReject::kNone;
  }
}

CommandReject preflightDispenseEnqueue(const DispenseCommand& cmd, const StatusSnapshot& status,
                                       uint8_t num_pumps, const ConfigStore& config,
                                       bool cancel_pending_this_poll) {
  if (status.cutoff_open) {
    return CommandReject::kCutoffOpen;
  }
  if (cmd.flow_gate && !status.scale_ready) {
    return CommandReject::kScaleNotReady;
  }
  const float ml_per_s = config.mlPerSecond(cmd.channel);
  const CommandReject params = validateDispenseParams(cmd, num_pumps, ml_per_s);
  if (params != CommandReject::kNone) {
    return params;
  }
  if ((status.job_busy || status.command_pending) && !cancel_pending_this_poll) {
    return CommandReject::kBusy;
  }
  return CommandReject::kNone;
}

CommandReject preflightPrimeEnqueue(uint8_t channel, const StatusSnapshot& status, uint8_t num_pumps,
                                    bool cancel_pending_this_poll) {
  if (status.cutoff_open) {
    return CommandReject::kCutoffOpen;
  }
  if (channel >= num_pumps) {
    return CommandReject::kBadPump;
  }
  if ((status.job_busy || status.command_pending) && !cancel_pending_this_poll) {
    return CommandReject::kBusy;
  }
  return CommandReject::kNone;
}

CommandReject preflightPrimeStopEnqueue(const StatusSnapshot& status) {
  if (status.job_busy &&
      status.job_phase != static_cast<uint8_t>(Coordinator::Phase::kPrime)) {
    return CommandReject::kBusy;
  }
  return CommandReject::kNone;
}

CommandParseResult parseCommandLine(char* line, const StatusSnapshot& status, uint8_t num_pumps,
                                    const ConfigStore& config, bool cancel_pending_this_poll) {
  CommandParseResult result;

  char* verb = strtok(line, " \t");
  if (verb == nullptr) {
    result.reject = CommandReject::kBadArgs;
    return result;
  }

  if (strcmp(verb, "cancel") == 0 || strcmp(verb, "stop") == 0) {
    if (strtok(nullptr, " \t") != nullptr) {
      result.reject = CommandReject::kBadArgs;
      return result;
    }
    result.is_cancel = true;
    return result;
  }

  if (strcmp(verb, "status") == 0) {
    if (strtok(nullptr, " \t") != nullptr) {
      result.reject = CommandReject::kBadArgs;
      return result;
    }
    result.is_status = true;
    return result;
  }

  if (strcmp(verb, "dispense") == 0) {
    char* first = strtok(nullptr, " \t");
    if (first == nullptr) {
      result.reject = CommandReject::kUsage;
      return result;
    }

    bool flow_gate = true;
    char* pump_tok = first;
    if (strcmp(first, "open") == 0) {
      flow_gate = false;
      pump_tok = strtok(nullptr, " \t");
    }

    char* ml_tok = strtok(nullptr, " \t");
    if (pump_tok == nullptr || ml_tok == nullptr) {
      result.reject = CommandReject::kUsage;
      return result;
    }

    if (strtok(nullptr, " \t") != nullptr) {
      result.reject = CommandReject::kBadArgs;
      return result;
    }

    char* pump_end = nullptr;
    char* ml_end = nullptr;
    const long pump = strtol(pump_tok, &pump_end, 10);
    const float ml = strtof(ml_tok, &ml_end);
    if (pump_end == pump_tok || *pump_end != '\0' || ml_end == ml_tok || *ml_end != '\0') {
      result.reject = CommandReject::kBadArgs;
      return result;
    }

    if (pump < 1 || pump > num_pumps) {
      result.reject = CommandReject::kBadPump;
      return result;
    }

    DispenseCommand cmd;
    cmd.channel = static_cast<uint8_t>(pump - 1);
    cmd.ml = ml;
    cmd.flow_gate = flow_gate;

    result.reject = preflightDispenseEnqueue(cmd, status, num_pumps, config, cancel_pending_this_poll);
    if (result.reject != CommandReject::kNone) {
      return result;
    }

    result.command.type = CommandType::kDispensePump;
    result.command.dispense = cmd;
    return result;
  }

  if (strcmp(verb, "prime") == 0) {
    char* arg = strtok(nullptr, " \t");
    if (arg == nullptr) {
      result.reject = CommandReject::kPrimeUsage;
      return result;
    }

    if (strcmp(arg, "stop") == 0) {
      if (strtok(nullptr, " \t") != nullptr) {
        result.reject = CommandReject::kBadArgs;
        return result;
      }
      result.reject = preflightPrimeStopEnqueue(status);
      if (result.reject != CommandReject::kNone) {
        return result;
      }
      result.command.type = CommandType::kPrimeStop;
      return result;
    }

    if (strtok(nullptr, " \t") != nullptr) {
      result.reject = CommandReject::kBadArgs;
      return result;
    }

    char* pump_end = nullptr;
    const long pump = strtol(arg, &pump_end, 10);
    if (pump_end == arg || *pump_end != '\0') {
      result.reject = CommandReject::kBadArgs;
      return result;
    }
    if (pump < 1 || pump > num_pumps) {
      result.reject = CommandReject::kBadPump;
      return result;
    }

    const uint8_t channel = static_cast<uint8_t>(pump - 1);
    result.reject =
        preflightPrimeEnqueue(channel, status, num_pumps, cancel_pending_this_poll);
    if (result.reject != CommandReject::kNone) {
      return result;
    }

    result.command.type = CommandType::kPrimePump;
    result.command.prime.channel = channel;
    return result;
  }

  if (strcmp(verb, "config") == 0) {
    if (strtok(nullptr, " \t") != nullptr) {
      result.reject = CommandReject::kBadArgs;
      return result;
    }
    result.config_op.type = ConfigOpType::kDump;
    return result;
  }

  if (strcmp(verb, "cal") == 0 || strcmp(verb, "bind") == 0 || strcmp(verb, "unbind") == 0) {
    char* pump_tok = strtok(nullptr, " \t");
    if (pump_tok == nullptr) {
      result.reject = CommandReject::kUsage;
      return result;
    }
    char* pump_end = nullptr;
    const long pump = strtol(pump_tok, &pump_end, 10);
    if (pump_end == pump_tok || *pump_end != '\0') {
      result.reject = CommandReject::kBadArgs;
      return result;
    }
    if (pump < 1 || pump > num_pumps) {
      result.reject = CommandReject::kBadPump;
      return result;
    }
    const uint8_t channel = static_cast<uint8_t>(pump - 1);
    result.config_op.channel = channel;

    if (strcmp(verb, "unbind") == 0) {
      if (strtok(nullptr, " \t") != nullptr) {
        result.reject = CommandReject::kBadArgs;
        return result;
      }
      result.config_op.type = ConfigOpType::kClearBinding;
      return result;
    }

    if (strcmp(verb, "bind") == 0) {
      char* ingredient = strtok(nullptr, " \t");
      if (ingredient == nullptr) {
        result.reject = CommandReject::kUsage;
        return result;
      }
      if (strtok(nullptr, " \t") != nullptr) {
        result.reject = CommandReject::kBadArgs;
        return result;
      }
      const std::size_t len = strlen(ingredient);
      if (len == 0 || len >= kIngredientIdMax) {
        result.reject = CommandReject::kBadIngredient;
        return result;
      }
      result.config_op.type = ConfigOpType::kSetBinding;
      memcpy(result.config_op.ingredient_id, ingredient, len);  // array is zero-initialized
      return result;
    }

    // cal <pump> <ml_per_s> [anti_drip_ms]
    char* rate_tok = strtok(nullptr, " \t");
    if (rate_tok == nullptr) {
      result.reject = CommandReject::kUsage;
      return result;
    }
    char* drip_tok = strtok(nullptr, " \t");
    if (strtok(nullptr, " \t") != nullptr) {
      result.reject = CommandReject::kBadArgs;
      return result;
    }
    char* rate_end = nullptr;
    const float rate = strtof(rate_tok, &rate_end);
    if (rate_end == rate_tok || *rate_end != '\0') {
      result.reject = CommandReject::kBadArgs;
      return result;
    }
    if (!std::isfinite(rate) || rate < kMinMlPerSecond || rate > kMaxMlPerSecond) {
      result.reject = CommandReject::kBadCalibration;
      return result;
    }
    result.config_op.type = ConfigOpType::kSetCalibration;
    result.config_op.ml_per_s = rate;
    if (drip_tok != nullptr) {
      char* drip_end = nullptr;
      const unsigned long drip = strtoul(drip_tok, &drip_end, 10);
      if (drip_end == drip_tok || *drip_end != '\0') {
        result.reject = CommandReject::kBadArgs;
        return result;
      }
      if (drip > kMaxAntiDripMs) {
        result.reject = CommandReject::kBadCalibration;
        return result;
      }
      result.config_op.anti_drip_ms = static_cast<uint32_t>(drip);
      result.config_op.has_anti_drip = true;
    }
    return result;
  }

  result.reject = CommandReject::kUnknownCommand;
  return result;
}
