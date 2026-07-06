#pragma once

#include <cstdint>

#include "command_queue.h"
#include "config.h"
#include "status_snapshot.h"

class ConfigStore;
class InventoryStore;

// Parse-time rejects (serial wire / future HTTP 400 mapping).
enum class CommandReject : uint8_t {
  kNone,
  kUnknownCommand,
  kUsage,
  kBadArgs,
  kBadPump,
  kBadMl,
  kPourTooLong,
  kSubResolutionMl,
  kScaleNotReady,
  kBusy,
  kLineTooLong,
  kBadCalibration,
  kBadIngredient,
  kPrimeUsage,
  kPourUsage,
  kTooManySteps,
  kNotPrimed,
  kLowInventory,
};

// Machine-config edits parsed off the wire (docs/16 "Machine config (NVS)").
// SerialTransport applies these to ConfigStore on the ControlTask (RAM only);
// the flash write happens at the next idle commit. NOT routed through the
// dispense queue — see the HTTP prerequisite note in the controller README.
enum class ConfigOpType : uint8_t {
  kNone,
  kSetCalibration,
  kSetBinding,
  kClearBinding,
  kDump,
  kInventoryRefill,
  kInventoryBottleSize,
  kInventoryLevel,
  kInventoryPrimed,
};

struct ConfigOp {
  ConfigOpType type = ConfigOpType::kNone;
  uint8_t channel = 0;  // 0-based (pump N -> N-1)
  float ml_per_s = 0.0f;
  uint32_t anti_drip_ms = 0;
  bool has_anti_drip = false;  // false -> keep the pump's existing anti-drip
  char ingredient_id[kIngredientIdMax] = {0};
  float inventory_ml = 0.0f;    // level / bottle-size ops
  bool inventory_bool = false;  // primed flag
};

struct CommandParseResult {
  CommandReject reject = CommandReject::kNone;
  Command command;
  bool is_cancel = false;
  bool is_status = false;
  ConfigOp config_op;
};

// Marlin-style wire strings for parse rejects and queue busy.
const char* commandRejectText(CommandReject reject);

// Runtime job reject codes (post-enqueue / coordinator).
const char* jobRejectText(JobReject reject);

// Shared bounds: channel in [0, num_pumps), ml finite/positive/max.
bool validateDispenseCommand(const DispenseCommand& cmd, uint8_t num_pumps, float max_ml);

// Shared pour-duration math for preflight and coordinator drain. On success writes
// rounded pour_ms (> 0). On failure optionally sets reject_out.
bool computePourDurationMs(const DispenseCommand& cmd, uint8_t num_pumps, float ml_per_s,
                           unsigned long* pour_ms_out, CommandReject* reject_out = nullptr);

// Map parse-time reject to runtime job reject (shared validation paths).
JobReject commandRejectToJobReject(CommandReject reject);

// Enqueue preflight: bounds + pour ceiling + sub-resolution + snapshot gates.
// cancel_pending_this_poll: same serial poll() already queued cancel — treat as
// not-busy for parse so "cancel\ndispense" in one burst works (drain order).
CommandReject preflightDispenseEnqueue(const DispenseCommand& cmd, const StatusSnapshot& status,
                                       uint8_t num_pumps, bool cancel_pending_this_poll = false);
CommandReject preflightDispenseEnqueue(const DispenseCommand& cmd, const StatusSnapshot& status,
                                       uint8_t num_pumps, const ConfigStore& config,
                                       bool cancel_pending_this_poll = false);

// Enqueue preflight for continuous prime: channel + busy gates.
CommandReject preflightPrimeEnqueue(uint8_t channel, const StatusSnapshot& status,
                                    uint8_t num_pumps, bool cancel_pending_this_poll = false);

// Enqueue preflight for operator prime stop: busy only when a non-prime job runs.
CommandReject preflightPrimeStopEnqueue(const StatusSnapshot& status);

// Shared step validation: bindings, per-step ml ceilings, aggregate sequence caps.
CommandReject validatePourSequenceSteps(const PourSequenceStep* steps, uint8_t step_count,
                                        uint8_t num_pumps, const ConfigStore& config);
CommandReject validatePourSequenceSteps(const PourSequenceStep* steps, uint8_t step_count,
                                        uint8_t num_pumps, const StatusSnapshot& status);

// Enqueue preflight for a multi-step pour (HTTP — snapshot only).
CommandReject preflightPourSequenceEnqueue(const PourSequenceCommand& cmd,
                                           const StatusSnapshot& status, uint8_t num_pumps,
                                           bool cancel_pending_this_poll = false);
CommandReject preflightPourSequenceEnqueue(const PourSequenceCommand& cmd,
                                           const StatusSnapshot& status, uint8_t num_pumps,
                                           const ConfigStore& config,
                                           const InventoryStore& inventory,
                                           bool cancel_pending_this_poll = false);

CommandReject validatePourSequenceInventory(const PourSequenceStep* steps, uint8_t step_count,
                                            const InventoryStore& inventory);
CommandReject validatePourSequenceInventory(const PourSequenceStep* steps, uint8_t step_count,
                                            const StatusSnapshot& status);

// Snapshot helpers for HTTP preflight (reads published rows only — no cross-core store access).
float snapshotMlPerSecond(const StatusSnapshot& status, uint8_t channel);
int snapshotChannelForIngredient(const StatusSnapshot& status, const char* ingredient_id);

// Mutates line with strtok (caller owns buffer). Rejects trailing tokens.
// Pump numbers on the wire are 1-based; DispenseCommand.channel is 0-based.
CommandParseResult parseCommandLine(char* line, const StatusSnapshot& status, uint8_t num_pumps,
                                    const ConfigStore& config, const InventoryStore& inventory,
                                    bool cancel_pending_this_poll = false);
