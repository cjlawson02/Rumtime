#pragma once

#include <cstdint>

#include "command_queue.h"
#include "status_snapshot.h"

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
  kCutoffOpen,
  kBusy,
  kLineTooLong,
};

struct CommandParseResult {
  CommandReject reject = CommandReject::kNone;
  Command command;
  bool is_cancel = false;
  bool is_status = false;
};

// Marlin-style wire strings for parse rejects and queue busy.
const char* commandRejectText(CommandReject reject);

// Runtime job reject codes (post-enqueue / coordinator).
const char* jobRejectText(JobReject reject);

// Shared bounds: channel in [0, num_pumps), ml finite/positive/max.
bool validateDispenseCommand(const DispenseCommand& cmd, uint8_t num_pumps, float max_ml);

// Enqueue preflight: bounds + pour ceiling + sub-resolution + snapshot gates.
// cancel_pending_this_poll: same serial poll() already queued cancel — treat as
// not-busy for parse so "cancel\ndispense" in one burst works (drain order).
CommandReject preflightDispenseEnqueue(const DispenseCommand& cmd, const StatusSnapshot& status,
                                       uint8_t num_pumps, bool cancel_pending_this_poll = false);

// Mutates line with strtok (caller owns buffer). Rejects trailing tokens.
// Pump numbers on the wire are 1-based; DispenseCommand.channel is 0-based.
CommandParseResult parseCommandLine(char* line, const StatusSnapshot& status, uint8_t num_pumps,
                                    bool cancel_pending_this_poll = false);
