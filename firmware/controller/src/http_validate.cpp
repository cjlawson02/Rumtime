#include "http_validate.h"

#include <cmath>
#include <cstring>

#include "config.h"
#include "config_store.h"
#include "inventory_store.h"

const char* httpErrorCode(CommandReject reject) {
  switch (reject) {
    case CommandReject::kNone:
      return "ok";
    case CommandReject::kBusy:
      return "busy";
    case CommandReject::kBadArgs:
    case CommandReject::kUsage:
    case CommandReject::kPrimeUsage:
    case CommandReject::kPourUsage:
      return "bad_request";
    case CommandReject::kBadPump:
      return "bad_pump";
    case CommandReject::kBadMl:
      return "bad_ml";
    case CommandReject::kPourTooLong:
      return "pour_too_long";
    case CommandReject::kSubResolutionMl:
      return "sub_resolution_ml";
    case CommandReject::kScaleNotReady:
      return "scale_not_ready";
    case CommandReject::kBadCalibration:
      return "bad_calibration";
    case CommandReject::kBadIngredient:
      return "bad_ingredient";
    case CommandReject::kTooManySteps:
      return "too_many_steps";
    case CommandReject::kNotPrimed:
      return "not_primed";
    case CommandReject::kLowInventory:
      return "low_inventory";
    case CommandReject::kUnknownCommand:
    case CommandReject::kLineTooLong:
    default:
      return "bad_request";
  }
}

const char* httpErrorCodeConfig(ConfigOpReject reject) {
  switch (reject) {
    case ConfigOpReject::kNone:
      return "ok";
    case ConfigOpReject::kBusy:
      return "busy";
    case ConfigOpReject::kBadPump:
      return "bad_pump";
    case ConfigOpReject::kBadCalibration:
      return "bad_calibration";
    case ConfigOpReject::kBadIngredient:
      return "bad_ingredient";
    case ConfigOpReject::kBadArgs:
    default:
      return "bad_request";
  }
}

HttpStatus httpStatusForReject(CommandReject reject) {
  switch (reject) {
    case CommandReject::kNone:
      return HttpStatus::kOkNoContent;
    case CommandReject::kBusy:
      return HttpStatus::kConflict;
    default:
      return HttpStatus::kUnprocessable;
  }
}

HttpStatus httpStatusForConfigReject(ConfigOpReject reject) {
  switch (reject) {
    case ConfigOpReject::kNone:
      return HttpStatus::kOkNoContent;
    case ConfigOpReject::kBusy:
      return HttpStatus::kConflict;
    default:
      return HttpStatus::kUnprocessable;
  }
}

const char* httpMessageForReject(CommandReject reject) {
  switch (reject) {
    case CommandReject::kBusy:
      return "Device busy";
    case CommandReject::kScaleNotReady:
      return "Scale not ready";
    case CommandReject::kNotPrimed:
      return "Ingredient line not primed";
    case CommandReject::kLowInventory:
      return "Insufficient inventory (reserve ml)";
    case CommandReject::kBadIngredient:
      return "Unbound or unknown ingredient";
    case CommandReject::kBadPump:
      return "Invalid pump id";
    case CommandReject::kBadMl:
      return "Invalid ml value";
    case CommandReject::kPourTooLong:
      return "Pour duration exceeds limit";
    case CommandReject::kTooManySteps:
      return "Too many pour steps";
    case CommandReject::kBadCalibration:
      return "Invalid calibration";
    default:
      return "Request rejected";
  }
}

ConfigOpReject preflightConfigOpEnqueue(const ConfigOp& op, const StatusSnapshot& status,
                                        uint8_t num_pumps) {
  if (status.job_busy || status.sequence_busy || status.command_pending ||
      status.config_op_pending) {
    return ConfigOpReject::kBusy;
  }
  if (op.type == ConfigOpType::kSetCalibration || op.type == ConfigOpType::kSetBinding ||
      op.type == ConfigOpType::kClearBinding) {
    if (op.channel >= num_pumps) {
      return ConfigOpReject::kBadPump;
    }
  }
  if (op.type == ConfigOpType::kSetBinding) {
    const std::size_t len = std::strlen(op.ingredient_id);
    if (len == 0 || len >= kIngredientIdMax) {
      return ConfigOpReject::kBadIngredient;
    }
  }
  if (op.type == ConfigOpType::kSetCalibration) {
    if (!std::isfinite(op.ml_per_s) || op.ml_per_s < kMinMlPerSecond ||
        op.ml_per_s > kMaxMlPerSecond) {
      return ConfigOpReject::kBadCalibration;
    }
    if (op.has_anti_drip && op.anti_drip_ms > kMaxAntiDripMs) {
      return ConfigOpReject::kBadCalibration;
    }
  }
  if (op.type == ConfigOpType::kInventoryRefill || op.type == ConfigOpType::kInventoryBottleSize ||
      op.type == ConfigOpType::kInventoryLevel || op.type == ConfigOpType::kInventoryPrimed) {
    if (op.ingredient_id[0] == '\0') {
      return ConfigOpReject::kBadIngredient;
    }
  }
  if (op.type == ConfigOpType::kInventoryBottleSize) {
    if (!std::isfinite(op.inventory_ml) || op.inventory_ml <= 0.0f) {
      return ConfigOpReject::kBadArgs;
    }
  }
  if (op.type == ConfigOpType::kInventoryLevel) {
    if (!std::isfinite(op.inventory_ml) || op.inventory_ml < 0.0f) {
      return ConfigOpReject::kBadArgs;
    }
  }
  return ConfigOpReject::kNone;
}

ConfigOpReject applyConfigOp(const ConfigOp& op, ConfigStore& config, InventoryStore& inventory) {
  switch (op.type) {
    case ConfigOpType::kSetCalibration: {
      const uint32_t anti_drip = op.has_anti_drip ? op.anti_drip_ms : config.antiDripMs(op.channel);
      if (!config.setCalibration(op.channel, op.ml_per_s, anti_drip)) {
        return ConfigOpReject::kBadCalibration;
      }
      return ConfigOpReject::kNone;
    }
    case ConfigOpType::kSetBinding: {
      const char* prev = config.ingredient(op.channel);
      char prev_id[kIngredientIdMax] = {0};
      if (prev[0] != '\0') {
        std::strncpy(prev_id, prev, kIngredientIdMax - 1);
      }
      if (!config.setBinding(op.channel, op.ingredient_id)) {
        return ConfigOpReject::kBadIngredient;
      }
      if (prev_id[0] != '\0' && std::strcmp(prev_id, op.ingredient_id) != 0) {
        inventory.clearIngredient(prev_id);
      }
      if (!inventory.seedOnBinding(op.ingredient_id)) {
        config.clearBinding(op.channel);
        if (prev_id[0] != '\0') {
          config.setBinding(op.channel, prev_id);
          inventory.seedOnBinding(prev_id);
        }
        return ConfigOpReject::kBadIngredient;
      }
      return ConfigOpReject::kNone;
    }
    case ConfigOpType::kClearBinding: {
      const char* prev = config.ingredient(op.channel);
      if (prev[0] != '\0') {
        inventory.clearIngredient(prev);
      }
      config.clearBinding(op.channel);
      return ConfigOpReject::kNone;
    }
    case ConfigOpType::kInventoryRefill:
      if (!inventory.refill(op.ingredient_id)) {
        return ConfigOpReject::kBadIngredient;
      }
      return ConfigOpReject::kNone;
    case ConfigOpType::kInventoryBottleSize:
      if (!inventory.setBottleSizeMl(op.ingredient_id, op.inventory_ml)) {
        return ConfigOpReject::kBadArgs;
      }
      return ConfigOpReject::kNone;
    case ConfigOpType::kInventoryLevel:
      if (!inventory.setRemainingMl(op.ingredient_id, op.inventory_ml)) {
        return ConfigOpReject::kBadArgs;
      }
      return ConfigOpReject::kNone;
    case ConfigOpType::kInventoryPrimed:
      if (!inventory.setPrimed(op.ingredient_id, op.inventory_bool)) {
        return ConfigOpReject::kBadIngredient;
      }
      return ConfigOpReject::kNone;
    case ConfigOpType::kDump:
    case ConfigOpType::kNone:
    default:
      return ConfigOpReject::kBadArgs;
  }
}
