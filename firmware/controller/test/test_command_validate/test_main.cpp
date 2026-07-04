#include <unity.h>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
#include <string>

#include "command_validate.h"
#include "config.h"
#include "config_store.h"

namespace {

constexpr uint8_t kNumPumps = 2;

bool nvsBegin(const char*) {
  return true;
}
bool nvsGetBlob(const char*, void*, std::size_t) {
  return false;
}
bool nvsSetBlob(const char*, const void*, std::size_t) {
  return true;
}
bool nvsCommit() {
  return true;
}

ConfigStore g_config;
const NvsOps kTestNvsOps = {nvsBegin, nvsGetBlob, nvsSetBlob, nvsCommit};

void resetConfig() {
  g_config.begin(kTestNvsOps);
}

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
  return parseCommandLine(line, status, kNumPumps, g_config, cancel_pending_this_poll);
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
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps, g_config);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_bad_ml_over_max() {
  char line[64];
  snprintf(line, sizeof(line), "dispense 1 %g", kMaxDispenseMl + 1.0f);
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps, g_config);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_reject_pour_too_long() {
  const float over_duration_ml =
      (static_cast<float>(kMaxPourDurationMs) / 1000.0f) * kDefaultMlPerSecond + 1.0f;
  char line[64];
  snprintf(line, sizeof(line), "dispense 1 %g", over_duration_ml);
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps, g_config);
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
  TEST_ASSERT_EQUAL_STRING("Error:bad calibration",
                           commandRejectText(CommandReject::kBadCalibration));
  TEST_ASSERT_EQUAL_STRING("Error:bad ingredient",
                           commandRejectText(CommandReject::kBadIngredient));
}

void test_cal_with_anti_drip() {
  const CommandParseResult r = parseCopy("cal 2 2.5 250", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpType::kSetCalibration),
                    static_cast<int>(r.config_op.type));
  TEST_ASSERT_EQUAL_UINT8(1, r.config_op.channel);  // 1-based wire -> 0-based
  TEST_ASSERT_EQUAL_FLOAT(2.5f, r.config_op.ml_per_s);
  TEST_ASSERT_TRUE(r.config_op.has_anti_drip);
  TEST_ASSERT_EQUAL_UINT32(250, r.config_op.anti_drip_ms);
}

void test_cal_without_anti_drip_keeps_flag_false() {
  const CommandParseResult r = parseCopy("cal 1 3.0", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpType::kSetCalibration),
                    static_cast<int>(r.config_op.type));
  TEST_ASSERT_FALSE(r.config_op.has_anti_drip);
}

void test_cal_rejects_out_of_range_rate() {
  char line[64];
  snprintf(line, sizeof(line), "cal 1 %g", kMaxMlPerSecond + 1.0f);
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps, g_config);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadCalibration), static_cast<int>(r.reject));
}

void test_cal_rejects_anti_drip_too_long() {
  char line[64];
  snprintf(line, sizeof(line), "cal 1 2.0 %lu", static_cast<unsigned long>(kMaxAntiDripMs) + 1UL);
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps, g_config);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadCalibration), static_cast<int>(r.reject));
}

void test_cal_bad_pump() {
  const CommandParseResult r = parseCopy("cal 3 2.0", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadPump), static_cast<int>(r.reject));
}

void test_cal_missing_rate_usage() {
  const CommandParseResult r = parseCopy("cal 1", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kUsage), static_cast<int>(r.reject));
}

void test_bind_ok() {
  const CommandParseResult r = parseCopy("bind 1 bourbon", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpType::kSetBinding),
                    static_cast<int>(r.config_op.type));
  TEST_ASSERT_EQUAL_UINT8(0, r.config_op.channel);
  TEST_ASSERT_EQUAL_STRING("bourbon", r.config_op.ingredient_id);
}

void test_bind_too_long_ingredient() {
  char line[64];
  std::string ing(kIngredientIdMax, 'x');  // no room for NUL
  snprintf(line, sizeof(line), "bind 1 %s", ing.c_str());
  const CommandParseResult r = parseCommandLine(line, idleStatus(), kNumPumps, g_config);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadIngredient), static_cast<int>(r.reject));
}

void test_bind_missing_ingredient_usage() {
  const CommandParseResult r = parseCopy("bind 1", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kUsage), static_cast<int>(r.reject));
}

void test_unbind_ok() {
  const CommandParseResult r = parseCopy("unbind 2", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpType::kClearBinding),
                    static_cast<int>(r.config_op.type));
  TEST_ASSERT_EQUAL_UINT8(1, r.config_op.channel);
}

void test_unbind_trailing_rejects() {
  const CommandParseResult r = parseCopy("unbind 1 extra", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_config_dump_ok() {
  const CommandParseResult r = parseCopy("config", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpType::kDump), static_cast<int>(r.config_op.type));
}

void test_config_trailing_rejects() {
  const CommandParseResult r = parseCopy("config extra", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_job_reject_text() {
  TEST_ASSERT_EQUAL_STRING("flow-timeout", jobRejectText(JobReject::kFlowTimeout));
  TEST_ASSERT_EQUAL_STRING("cutoff-open", jobRejectText(JobReject::kCutoffOpen));
  TEST_ASSERT_EQUAL_STRING("none", jobRejectText(JobReject::kNone));
}

void test_preflight_slow_calibration_rejects_pour_too_long() {
  resetConfig();
  TEST_ASSERT_TRUE(g_config.setCalibration(0, 0.05f, 100));
  // 200 ml @ 0.05 ml/s = 4000 s pour — exceeds kMaxPourDurationMs.
  const CommandParseResult r = parseCopy("dispense 1 200", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kPourTooLong), static_cast<int>(r.reject));
}

void test_preflight_fast_calibration_accepts_large_volume() {
  resetConfig();
  TEST_ASSERT_TRUE(g_config.setCalibration(0, 50.0f, 100));
  // 250 ml @ 50 ml/s = 5 s — passes preflight (would fail at default 1.75 ml/s).
  const CommandParseResult r = parseCopy("dispense 1 250", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
}

}  // namespace

void setUp() {
  resetConfig();
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
  RUN_TEST(test_cal_with_anti_drip);
  RUN_TEST(test_cal_without_anti_drip_keeps_flag_false);
  RUN_TEST(test_cal_rejects_out_of_range_rate);
  RUN_TEST(test_cal_rejects_anti_drip_too_long);
  RUN_TEST(test_cal_bad_pump);
  RUN_TEST(test_cal_missing_rate_usage);
  RUN_TEST(test_bind_ok);
  RUN_TEST(test_bind_too_long_ingredient);
  RUN_TEST(test_bind_missing_ingredient_usage);
  RUN_TEST(test_unbind_ok);
  RUN_TEST(test_unbind_trailing_rejects);
  RUN_TEST(test_config_dump_ok);
  RUN_TEST(test_config_trailing_rejects);
  RUN_TEST(test_preflight_slow_calibration_rejects_pour_too_long);
  RUN_TEST(test_preflight_fast_calibration_accepts_large_volume);
  return UNITY_END();
}
