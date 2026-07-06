#pragma once

#include <cstdint>

#include "command_validate.h"
#include "config_op_queue.h"

// HTTP error mapping (docs/18 / phase 5 locked table).
enum class HttpStatus : uint16_t {
  kOkNoContent = 204,
  kBadRequest = 400,
  kNotFound = 404,
  kConflict = 409,
  kUnprocessable = 422,
  kNotImplemented = 501,
  kServiceUnavailable = 503,
};

// Stable JSON error codes for 4xx responses.
const char* httpErrorCode(CommandReject reject);
const char* httpErrorCodeConfig(ConfigOpReject reject);
HttpStatus httpStatusForReject(CommandReject reject);
HttpStatus httpStatusForConfigReject(ConfigOpReject reject);
const char* httpMessageForReject(CommandReject reject);

// Preflight config/inventory op when motion or queue pending.
ConfigOpReject preflightConfigOpEnqueue(const ConfigOp& op, const StatusSnapshot& status,
                                        uint8_t num_pumps);

// Apply a config/inventory op to stores (ControlTask only).
ConfigOpReject applyConfigOp(const ConfigOp& op, class ConfigStore& config,
                             class InventoryStore& inventory);
