#include "command_validate.h"

#include <cmath>
#include <cstdlib>
#include <cstring>

#include "config.h"
#include "config_store.h"
#include "coordinator.h"
#include "inventory_policy.h"
#include "inventory_store.h"

namespace {

CommandReject validateDispenseParams(const DispenseCommand& cmd, uint8_t num_pumps,
                                     float ml_per_s) {
  unsigned long pour_ms = 0;
  CommandReject reject = CommandReject::kNone;
  if (!computePourDurationMs(cmd, num_pumps, ml_per_s, &pour_ms, &reject)) {
    return reject;
  }
  return CommandReject::kNone;
}

CommandReject preflightMotionBusy(const StatusSnapshot& status, bool cancel_pending_this_poll,
                                  bool check_config_op = true) {
  if (check_config_op && status.config_op_pending) {
    return CommandReject::kBusy;
  }
  if ((status.job_busy || status.command_pending) && !cancel_pending_this_poll) {
    return CommandReject::kBusy;
  }
  if (status.sequence_busy && !cancel_pending_this_poll) {
    return CommandReject::kBusy;
  }
  return CommandReject::kNone;
}

CommandReject validatePourSequenceStepsImpl(const PourSequenceStep* steps, uint8_t step_count,
                                            uint8_t num_pumps, const ConfigStore* config,
                                            const StatusSnapshot* status) {
  if (steps == nullptr || step_count == 0 || step_count > kMaxPourSequenceSteps) {
    return CommandReject::kBadArgs;
  }

  float total_ml = 0.0f;
  unsigned long total_pour_ms = 0;

  for (uint8_t i = 0; i < step_count; ++i) {
    const PourSequenceStep& step = steps[i];
    if (step.ingredient_id[0] == '\0') {
      return CommandReject::kBadIngredient;
    }

    int channel = -1;
    if (config != nullptr) {
      channel = config->channelForIngredient(step.ingredient_id);
    } else if (status != nullptr) {
      channel = snapshotChannelForIngredient(*status, step.ingredient_id);
    } else {
      return CommandReject::kBadArgs;
    }
    if (channel < 0 || static_cast<uint8_t>(channel) >= num_pumps) {
      return CommandReject::kBadIngredient;
    }

    DispenseCommand dispense;
    dispense.channel = static_cast<uint8_t>(channel);
    dispense.ml = step.ml;
    dispense.flow_gate = true;

    const float ml_per_s = config != nullptr ? config->mlPerSecond(dispense.channel)
                                             : snapshotMlPerSecond(*status, dispense.channel);
    const CommandReject params = validateDispenseParams(dispense, num_pumps, ml_per_s);
    if (params != CommandReject::kNone) {
      return params;
    }

    unsigned long pour_ms = 0;
    if (!computePourDurationMs(dispense, num_pumps, ml_per_s, &pour_ms, nullptr)) {
      return CommandReject::kBadMl;
    }
    total_ml += step.ml;
    total_pour_ms += pour_ms;
    total_pour_ms += kFlowDetectTimeoutMs;
  }

  if (total_ml > kMaxSequenceTotalMl) {
    return CommandReject::kBadMl;
  }
  if (total_pour_ms > kMaxSequenceDurationMs) {
    return CommandReject::kPourTooLong;
  }
  return CommandReject::kNone;
}

CommandReject validatePourSequenceInventoryImpl(const PourSequenceStep* steps, uint8_t step_count,
                                                const InventoryStore* inventory,
                                                const StatusSnapshot* status) {
  if (steps == nullptr || step_count == 0) {
    return CommandReject::kBadArgs;
  }
  for (uint8_t i = 0; i < step_count; ++i) {
    const PourSequenceStep& step = steps[i];
    bool first_for_ingredient = true;
    for (uint8_t k = 0; k < i; ++k) {
      if (std::strcmp(steps[k].ingredient_id, step.ingredient_id) == 0) {
        first_for_ingredient = false;
        break;
      }
    }
    if (!first_for_ingredient) {
      continue;
    }

    float total_ml = 0.0f;
    for (uint8_t j = 0; j < step_count; ++j) {
      if (std::strcmp(steps[j].ingredient_id, step.ingredient_id) == 0) {
        total_ml += steps[j].ml;
      }
    }

    if (inventory != nullptr) {
      const InventoryEntry* entry = inventory->find(step.ingredient_id);
      if (entry == nullptr || !entry->primed) {
        return CommandReject::kNotPrimed;
      }
      if (!inventoryPourAllowed(entry->primed, entry->remaining_ml, total_ml)) {
        return CommandReject::kLowInventory;
      }
    } else if (status != nullptr) {
      const SnapshotBinding* entry = nullptr;
      for (uint8_t b = 0; b < status->published_binding_count; ++b) {
        if (std::strcmp(status->published_bindings[b].ingredient_id, step.ingredient_id) == 0) {
          entry = &status->published_bindings[b];
          break;
        }
      }
      if (entry == nullptr || !entry->primed) {
        return CommandReject::kNotPrimed;
      }
      if (!inventoryPourAllowed(entry->primed, entry->remaining_ml, total_ml)) {
        return CommandReject::kLowInventory;
      }
    } else {
      return CommandReject::kBadArgs;
    }
  }
  return CommandReject::kNone;
}

CommandReject preflightDispenseEnqueueImpl(const DispenseCommand& cmd, const StatusSnapshot& status,
                                           uint8_t num_pumps, const ConfigStore* config,
                                           bool cancel_pending_this_poll) {
  const CommandReject busy = preflightMotionBusy(status, cancel_pending_this_poll);
  if (busy != CommandReject::kNone) {
    return busy;
  }
  if (cmd.flow_gate && !status.scale_ready) {
    return CommandReject::kScaleNotReady;
  }
  const float ml_per_s = config != nullptr ? config->mlPerSecond(cmd.channel)
                                           : snapshotMlPerSecond(status, cmd.channel);
  return validateDispenseParams(cmd, num_pumps, ml_per_s);
}

CommandReject preflightPourSequenceEnqueueImpl(const PourSequenceCommand& cmd,
                                               const StatusSnapshot& status, uint8_t num_pumps,
                                               const ConfigStore* config,
                                               const InventoryStore* inventory,
                                               bool cancel_pending_this_poll) {
  if (!status.scale_ready) {
    return CommandReject::kScaleNotReady;
  }

  const CommandReject validated = validatePourSequenceStepsImpl(
      cmd.steps, cmd.step_count, num_pumps, config, config == nullptr ? &status : nullptr);
  if (validated != CommandReject::kNone) {
    return validated;
  }

  const CommandReject inventory_reject = validatePourSequenceInventoryImpl(
      cmd.steps, cmd.step_count, inventory, inventory == nullptr ? &status : nullptr);
  if (inventory_reject != CommandReject::kNone) {
    return inventory_reject;
  }

  if (status.config_op_pending) {
    return CommandReject::kBusy;
  }
  return preflightMotionBusy(status, cancel_pending_this_poll, false);
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
    case CommandReject::kPourUsage:
      return "Error:usage pour <ingredient> <ml> [<ingredient> <ml> ...]";
    case CommandReject::kTooManySteps:
      return "Error:too many steps";
    case CommandReject::kNotPrimed:
      return "Error:not primed";
    case CommandReject::kLowInventory:
      return "Error:low inventory";
  }
  return "Error:unknown";
}

const char* jobRejectText(JobReject reject) {
  switch (reject) {
    case JobReject::kNone:
      return "none";
    case JobReject::kBusy:
      return "busy";
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
    case JobReject::kPrimeTimeout:
      return "prime-timeout";
    case JobReject::kUnboundIngredient:
      return "unbound-ingredient";
    case JobReject::kBadCalibration:
      return "bad-calibration";
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
    case CommandReject::kScaleNotReady:
      return JobReject::kScaleNotReady;
    case CommandReject::kBadIngredient:
      return JobReject::kUnboundIngredient;
    case CommandReject::kBadCalibration:
      return JobReject::kBadCalibration;
    case CommandReject::kNotPrimed:
    case CommandReject::kLowInventory:
      return JobReject::kBadMl;
    case CommandReject::kBadArgs:
    case CommandReject::kTooManySteps:
      return JobReject::kBadMl;
    case CommandReject::kBusy:
      return JobReject::kBusy;
    default:
      return JobReject::kNone;
  }
}

float snapshotMlPerSecond(const StatusSnapshot& status, uint8_t channel) {
  for (uint8_t i = 0; i < status.published_pump_count; ++i) {
    const SnapshotPump& pump = status.published_pumps[i];
    if (pump.pump_id == channel + 1) {
      return pump.ml_per_second;
    }
  }
  return kDefaultMlPerSecond;
}

int snapshotChannelForIngredient(const StatusSnapshot& status, const char* ingredient_id) {
  if (ingredient_id == nullptr || ingredient_id[0] == '\0') {
    return -1;
  }
  for (uint8_t i = 0; i < status.published_pump_count; ++i) {
    const SnapshotPump& pump = status.published_pumps[i];
    if (pump.bound && std::strcmp(pump.ingredient_id, ingredient_id) == 0) {
      return static_cast<int>(pump.pump_id) - 1;
    }
  }
  return -1;
}

CommandReject preflightDispenseEnqueue(const DispenseCommand& cmd, const StatusSnapshot& status,
                                       uint8_t num_pumps, bool cancel_pending_this_poll) {
  return preflightDispenseEnqueueImpl(cmd, status, num_pumps, nullptr, cancel_pending_this_poll);
}

CommandReject preflightPrimeEnqueue(uint8_t channel, const StatusSnapshot& status,
                                    uint8_t num_pumps, bool cancel_pending_this_poll) {
  const CommandReject busy = preflightMotionBusy(status, cancel_pending_this_poll);
  if (busy != CommandReject::kNone) {
    return busy;
  }
  if (channel >= num_pumps) {
    return CommandReject::kBadPump;
  }
  return CommandReject::kNone;
}

CommandReject preflightDispenseEnqueue(const DispenseCommand& cmd, const StatusSnapshot& status,
                                       uint8_t num_pumps, const ConfigStore& config,
                                       bool cancel_pending_this_poll) {
  return preflightDispenseEnqueueImpl(cmd, status, num_pumps, &config, cancel_pending_this_poll);
}

CommandReject preflightPrimeStopEnqueue(const StatusSnapshot& status) {
  if (status.sequence_busy) {
    return CommandReject::kBusy;
  }
  if (status.job_busy && status.job_phase != static_cast<uint8_t>(Coordinator::Phase::kPrime)) {
    return CommandReject::kBusy;
  }
  return CommandReject::kNone;
}

CommandReject validatePourSequenceSteps(const PourSequenceStep* steps, uint8_t step_count,
                                        uint8_t num_pumps, const ConfigStore& config) {
  return validatePourSequenceStepsImpl(steps, step_count, num_pumps, &config, nullptr);
}

CommandReject validatePourSequenceInventory(const PourSequenceStep* steps, uint8_t step_count,
                                            const InventoryStore& inventory) {
  return validatePourSequenceInventoryImpl(steps, step_count, &inventory, nullptr);
}

CommandReject validatePourSequenceSteps(const PourSequenceStep* steps, uint8_t step_count,
                                        uint8_t num_pumps, const StatusSnapshot& status) {
  return validatePourSequenceStepsImpl(steps, step_count, num_pumps, nullptr, &status);
}

CommandReject validatePourSequenceInventory(const PourSequenceStep* steps, uint8_t step_count,
                                            const StatusSnapshot& status) {
  return validatePourSequenceInventoryImpl(steps, step_count, nullptr, &status);
}

CommandReject preflightPourSequenceEnqueue(const PourSequenceCommand& cmd,
                                           const StatusSnapshot& status, uint8_t num_pumps,
                                           bool cancel_pending_this_poll) {
  return preflightPourSequenceEnqueueImpl(cmd, status, num_pumps, nullptr, nullptr,
                                          cancel_pending_this_poll);
}

CommandReject preflightPourSequenceEnqueue(const PourSequenceCommand& cmd,
                                           const StatusSnapshot& status, uint8_t num_pumps,
                                           const ConfigStore& config,
                                           const InventoryStore& inventory,
                                           bool cancel_pending_this_poll) {
  return preflightPourSequenceEnqueueImpl(cmd, status, num_pumps, &config, &inventory,
                                          cancel_pending_this_poll);
}

CommandParseResult parseCommandLine(char* line, const StatusSnapshot& status, uint8_t num_pumps,
                                    const ConfigStore& config, const InventoryStore& inventory,
                                    bool cancel_pending_this_poll) {
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

    result.reject =
        preflightDispenseEnqueue(cmd, status, num_pumps, config, cancel_pending_this_poll);
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
    result.reject = preflightPrimeEnqueue(channel, status, num_pumps, cancel_pending_this_poll);
    if (result.reject != CommandReject::kNone) {
      return result;
    }

    result.command.type = CommandType::kPrimePump;
    result.command.prime.channel = channel;
    return result;
  }

  if (strcmp(verb, "pour") == 0) {
    PourSequenceCommand seq;
    char* ingredient = strtok(nullptr, " \t");
    while (ingredient != nullptr) {
      if (seq.step_count >= kMaxPourSequenceSteps) {
        result.reject = CommandReject::kTooManySteps;
        return result;
      }
      char* ml_tok = strtok(nullptr, " \t");
      if (ml_tok == nullptr) {
        result.reject = CommandReject::kPourUsage;
        return result;
      }
      char* ml_end = nullptr;
      const float ml = strtof(ml_tok, &ml_end);
      if (ml_end == ml_tok || *ml_end != '\0') {
        result.reject = CommandReject::kBadArgs;
        return result;
      }
      const std::size_t len = strlen(ingredient);
      if (len == 0 || len >= kIngredientIdMax) {
        result.reject = CommandReject::kBadIngredient;
        return result;
      }
      PourSequenceStep& step = seq.steps[seq.step_count];
      memcpy(step.ingredient_id, ingredient, len);
      step.ml = ml;
      ++seq.step_count;
      ingredient = strtok(nullptr, " \t");
    }
    if (seq.step_count == 0) {
      result.reject = CommandReject::kPourUsage;
      return result;
    }

    result.reject = preflightPourSequenceEnqueue(seq, status, num_pumps, config, inventory,
                                                 cancel_pending_this_poll);
    if (result.reject != CommandReject::kNone) {
      return result;
    }

    result.command.type = CommandType::kPourSequence;
    result.command.pour_sequence = seq;
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
