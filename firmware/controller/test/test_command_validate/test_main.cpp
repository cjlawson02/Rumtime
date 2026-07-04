#include <unity.h>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>

#include "command_validate.h"
#include "config.h"

namespace {

constexpr uint8_t kNumPumps = 2;

StatusSnapshot idleStatus() {
  return StatusSnapshot{};
}

StatusSnapshot busyStatus() {
  StatusSnapshot s;
  s.job_busy = true;
  return s;
}

CommandParseResult parseCopy(const char* text, const StatusSnapshot& status,
                             bool cancel_pending_this_poll = false) {
  char line[64];
  std::strncpy(line, text, sizeof(line));
  line[sizeof(line) - 1] = '\0';
  return parseCommandLine(line, status, kNumPumps, cancel_pending_this_poll);
}

void test_valid_dispense_flow_gated() {
  const CommandParseResult r = parseCopy("dispense 1 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_FALSE(r.is_cancel);
  TEST_ASSERT_FALSE(r.is_status);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandType::kDispensePump), static_cast<int>(r.command.type));
  TEST_ASSERT_EQUAL_UINT8(0, r.command.dispense.channel);
  TEST_ASSERT_EQUAL_FLOAT(30.0f, r.command.dispense.ml);
  TEST_ASSERT_TRUE(r.command.dispense.flow_gate);
}

void test_valid_dispense_open() {
  const CommandParseResult r = parseCopy("dispense open 2 15.5", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL_UINT8(1, r.command.dispense.channel);
  TEST_ASSERT_EQUAL_FLOAT(15.5f, r.command.dispense.ml);
  TEST_ASSERT_FALSE(r.command.dispense.flow_gate);
}

void test_bad_pump_zero() {
  const CommandParseResult r = parseCopy("dispense 0 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadPump), static_cast<int>(r.reject));
}

void test_bad_pump_too_high() {
  const CommandParseResult r = parseCopy("dispense 3 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadPump), static_cast<int>(r.reject));
}

void test_bad_ml_zero() {
  const CommandParseResult r = parseCopy("dispense 1 0", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_bad_ml_negative() {
  const CommandParseResult r = parseCopy("dispense 1 -1", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_bad_ml_nan() {
  char line[64];
  snprintf(line, sizeof(line), "dispense 1 %g", std::nanf(""));
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_bad_ml_over_max() {
  char line[64];
  snprintf(line, sizeof(line), "dispense 1 %g", kMaxDispenseMl + 1.0f);
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_reject_pour_too_long() {
  const float over_duration_ml =
      (static_cast<float>(kMaxPourDurationMs) / 1000.0f) * kDefaultMlPerSecond + 1.0f;
  char line[64];
  snprintf(line, sizeof(line), "dispense 1 %g", over_duration_ml);
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kPourTooLong), static_cast<int>(r.reject));
}

void test_reject_sub_resolution_ml() {
  const CommandParseResult r = parseCopy("dispense 1 0.0001", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kSubResolutionMl), static_cast<int>(r.reject));
}

void test_reject_cutoff_open() {
  StatusSnapshot s;
  s.cutoff_open = true;
  const CommandParseResult r = parseCopy("dispense 1 30", s);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kCutoffOpen), static_cast<int>(r.reject));
}

void test_cancel_then_dispense_same_poll() {
  const CommandParseResult r =
      parseCopy("dispense 1 30", busyStatus(), /*cancel_pending_this_poll=*/true);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
}

void test_status_trailing_rejects() {
  const CommandParseResult r = parseCopy("status extra", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_whitespace_line_rejects() {
  const CommandParseResult r = parseCopy("   ", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_bad_args_non_numeric_pump() {
  const CommandParseResult r = parseCopy("dispense 3x 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_bad_args_trailing_garbage() {
  const CommandParseResult r = parseCopy("dispense 1 30 extra", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_cancel_ok() {
  const CommandParseResult r = parseCopy("cancel", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_TRUE(r.is_cancel);
}

void test_stop_ok() {
  const CommandParseResult r = parseCopy("stop", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_TRUE(r.is_cancel);
}

void test_cancel_trailing_rejects() {
  const CommandParseResult r = parseCopy("cancel now", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_stop_trailing_rejects() {
  const CommandParseResult r = parseCopy("stop please", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_unknown_command() {
  const CommandParseResult r = parseCopy("brew 1 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kUnknownCommand), static_cast<int>(r.reject));
}

void test_busy_when_job_busy() {
  const CommandParseResult r = parseCopy("dispense 1 30", busyStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBusy), static_cast<int>(r.reject));
}

void test_validate_dispense_ok() {
  DispenseCommand cmd;
  cmd.channel = 1;
  cmd.ml = 10.0f;
  TEST_ASSERT_TRUE(validateDispenseCommand(cmd, kNumPumps, kMaxDispenseMl));
}

void test_validate_dispense_channel_at_bound() {
  DispenseCommand cmd;
  cmd.channel = kNumPumps;
  cmd.ml = 10.0f;
  TEST_ASSERT_FALSE(validateDispenseCommand(cmd, kNumPumps, kMaxDispenseMl));
}

void test_validate_dispense_non_finite_ml() {
  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = std::numeric_limits<float>::quiet_NaN();
  TEST_ASSERT_FALSE(validateDispenseCommand(cmd, kNumPumps, kMaxDispenseMl));
}

void test_validate_dispense_over_max_ml() {
  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = kMaxDispenseMl + 1.0f;
  TEST_ASSERT_FALSE(validateDispenseCommand(cmd, kNumPumps, kMaxDispenseMl));
}

void test_command_reject_text() {
  TEST_ASSERT_EQUAL_STRING("Error:bad pump", commandRejectText(CommandReject::kBadPump));
  TEST_ASSERT_EQUAL_STRING("busy", commandRejectText(CommandReject::kBusy));
  TEST_ASSERT_EQUAL_STRING("Error:line too long", commandRejectText(CommandReject::kLineTooLong));
}

void test_job_reject_text() {
  TEST_ASSERT_EQUAL_STRING("flow-timeout", jobRejectText(JobReject::kFlowTimeout));
  TEST_ASSERT_EQUAL_STRING("cutoff-open", jobRejectText(JobReject::kCutoffOpen));
  TEST_ASSERT_EQUAL_STRING("none", jobRejectText(JobReject::kNone));
}

}  // namespace

void setUp() {
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_valid_dispense_flow_gated);
  RUN_TEST(test_valid_dispense_open);
  RUN_TEST(test_bad_pump_zero);
  RUN_TEST(test_bad_pump_too_high);
  RUN_TEST(test_bad_ml_zero);
  RUN_TEST(test_bad_ml_negative);
  RUN_TEST(test_bad_ml_nan);
  RUN_TEST(test_bad_ml_over_max);
  RUN_TEST(test_reject_pour_too_long);
  RUN_TEST(test_reject_sub_resolution_ml);
  RUN_TEST(test_reject_cutoff_open);
  RUN_TEST(test_cancel_then_dispense_same_poll);
  RUN_TEST(test_status_trailing_rejects);
  RUN_TEST(test_whitespace_line_rejects);
  RUN_TEST(test_bad_args_non_numeric_pump);
  RUN_TEST(test_bad_args_trailing_garbage);
  RUN_TEST(test_cancel_ok);
  RUN_TEST(test_stop_ok);
  RUN_TEST(test_cancel_trailing_rejects);
  RUN_TEST(test_stop_trailing_rejects);
  RUN_TEST(test_unknown_command);
  RUN_TEST(test_busy_when_job_busy);
  RUN_TEST(test_validate_dispense_ok);
  RUN_TEST(test_validate_dispense_channel_at_bound);
  RUN_TEST(test_validate_dispense_non_finite_ml);
  RUN_TEST(test_validate_dispense_over_max_ml);
  RUN_TEST(test_command_reject_text);
  RUN_TEST(test_job_reject_text);
  return UNITY_END();
}
