#include <unity.h>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>
#include <string>

#include "command_queue.h"
#include "command_validate.h"
#include "config.h"
#include "config_store.h"
#include "coordinator.h"
#include "inventory_store.h"

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

ConfigStore g_config;
InventoryStore g_inventory;
const NvsOps kTestNvsOps = {nvsBegin, nvsGetBlob, nvsSetBlob};

void resetConfig() {
  g_config.begin(kTestNvsOps);
  g_inventory.begin(kTestNvsOps);
}

void seedPrimedInventory(const char* ingredient_id, float remaining_ml = 750.0f) {
  g_inventory.seedOnBinding(ingredient_id);
  g_inventory.setRemainingMl(ingredient_id, remaining_ml);
  g_inventory.setPrimed(ingredient_id, true);
}

StatusSnapshot idleStatus() {
  StatusSnapshot s;
  s.scale_ready = true;
  return s;
}

StatusSnapshot busyStatus() {
  StatusSnapshot s;
  s.job_busy = true;
  s.scale_ready = true;
  return s;
}

CommandParseResult parseCopy(const char* text, const StatusSnapshot& status,
                             bool cancel_pending_this_poll = false) {
  char line[512];
  std::strncpy(line, text, sizeof(line));
  line[sizeof(line) - 1] = '\0';
  return parseCommandLine(line, status, kNumPumps, g_config, g_inventory, cancel_pending_this_poll);
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
  const CommandParseResult r =
      parseCommandLine(line, idleStatus(), kNumPumps, g_config, g_inventory);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_bad_ml_over_max() {
  char line[64];
  snprintf(line, sizeof(line), "dispense 1 %g", kMaxDispenseMl + 1.0f);
  const CommandParseResult r =
      parseCommandLine(line, idleStatus(), kNumPumps, g_config, g_inventory);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_reject_pour_too_long() {
  const float over_duration_ml =
      (static_cast<float>(kMaxPourDurationMs) / 1000.0f) * kDefaultMlPerSecond + 1.0f;
  char line[64];
  snprintf(line, sizeof(line), "dispense 1 %g", over_duration_ml);
  const CommandParseResult r =
      parseCommandLine(line, idleStatus(), kNumPumps, g_config, g_inventory);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kPourTooLong), static_cast<int>(r.reject));
}

void test_reject_sub_resolution_ml() {
  const CommandParseResult r = parseCopy("dispense 1 0.0001", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kSubResolutionMl), static_cast<int>(r.reject));
}

void test_cancel_then_dispense_same_poll() {
  const CommandParseResult r =
      parseCopy("dispense 1 30", busyStatus(), /*cancel_pending_this_poll=*/true);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
}

void test_reject_busy_when_command_pending() {
  StatusSnapshot s = idleStatus();
  s.command_pending = true;
  const CommandParseResult r = parseCopy("dispense 1 30", s);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBusy), static_cast<int>(r.reject));
}

void test_reject_scale_not_ready() {
  StatusSnapshot s = idleStatus();
  s.scale_ready = false;
  const CommandParseResult r = parseCopy("dispense 1 30", s);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kScaleNotReady), static_cast<int>(r.reject));
}

void test_dispense_open_ok_when_scale_not_ready() {
  StatusSnapshot s = idleStatus();
  s.scale_ready = false;
  const CommandParseResult r = parseCopy("dispense open 1 30", s);
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
  TEST_ASSERT_EQUAL_STRING("Error:scale not ready",
                           commandRejectText(CommandReject::kScaleNotReady));
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
  const CommandParseResult r =
      parseCommandLine(line, idleStatus(), kNumPumps, g_config, g_inventory);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadCalibration), static_cast<int>(r.reject));
}

void test_cal_rejects_anti_drip_too_long() {
  char line[64];
  snprintf(line, sizeof(line), "cal 1 2.0 %lu", static_cast<unsigned long>(kMaxAntiDripMs) + 1UL);
  const CommandParseResult r =
      parseCommandLine(line, idleStatus(), kNumPumps, g_config, g_inventory);
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
  const CommandParseResult r =
      parseCommandLine(line, idleStatus(), kNumPumps, g_config, g_inventory);
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
  TEST_ASSERT_EQUAL_STRING("scale-not-ready", jobRejectText(JobReject::kScaleNotReady));
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

void test_valid_prime() {
  const CommandParseResult r = parseCopy("prime 1", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(CommandType::kPrimePump), static_cast<int>(r.command.type));
  TEST_ASSERT_EQUAL_UINT8(0, r.command.prime.channel);
}

void test_valid_prime_stop() {
  const CommandParseResult r = parseCopy("prime stop", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(CommandType::kPrimeStop), static_cast<int>(r.command.type));
}

void test_prime_stop_rejects_during_dispense() {
  StatusSnapshot s = busyStatus();
  s.job_phase = static_cast<uint8_t>(Coordinator::Phase::kPour);
  const CommandParseResult r = parseCopy("prime stop", s);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBusy), static_cast<int>(r.reject));
}

void test_prime_stop_ok_during_prime() {
  StatusSnapshot s = busyStatus();
  s.job_phase = static_cast<uint8_t>(Coordinator::Phase::kPrime);
  const CommandParseResult r = parseCopy("prime stop", s);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(CommandType::kPrimeStop), static_cast<int>(r.command.type));
}

void test_prime_bad_pump() {
  const CommandParseResult r = parseCopy("prime 3", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadPump), static_cast<int>(r.reject));
}

void test_prime_reject_busy() {
  const CommandParseResult r = parseCopy("prime 1", busyStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBusy), static_cast<int>(r.reject));
}

void test_prime_stop_not_bare_stop() {
  const CommandParseResult r = parseCopy("prime stop", idleStatus());
  TEST_ASSERT_FALSE(r.is_cancel);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandType::kPrimeStop), static_cast<int>(r.command.type));
}

void test_prime_usage_missing_args() {
  const CommandParseResult r = parseCopy("prime", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kPrimeUsage), static_cast<int>(r.reject));
}

void test_prime_trailing_rejects() {
  const CommandParseResult r = parseCopy("prime 1 extra", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadArgs), static_cast<int>(r.reject));
}

void test_job_reject_prime_timeout_text() {
  TEST_ASSERT_EQUAL_STRING("prime-timeout", jobRejectText(JobReject::kPrimeTimeout));
}

void test_pour_two_step_ok() {
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(g_config.setBinding(1, "simple"));
  seedPrimedInventory("bourbon");
  seedPrimedInventory("simple");
  const CommandParseResult r = parseCopy("pour bourbon 30 simple 15", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone), static_cast<int>(r.reject));
  TEST_ASSERT_EQUAL(static_cast<int>(CommandType::kPourSequence), static_cast<int>(r.command.type));
  TEST_ASSERT_EQUAL_UINT8(2, r.command.pour_sequence.step_count);
  TEST_ASSERT_EQUAL_FLOAT(30.0f, r.command.pour_sequence.steps[0].ml);
  TEST_ASSERT_EQUAL_FLOAT(15.0f, r.command.pour_sequence.steps[1].ml);
}

void test_pour_unbound_ingredient() {
  const CommandParseResult r = parseCopy("pour rye 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadIngredient), static_cast<int>(r.reject));
}

void test_pour_reject_when_sequence_busy() {
  StatusSnapshot s = idleStatus();
  s.sequence_busy = true;
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  seedPrimedInventory("bourbon");
  const CommandParseResult r = parseCopy("pour bourbon 30", s);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBusy), static_cast<int>(r.reject));
}

void test_pour_reject_scale_not_ready() {
  StatusSnapshot s = idleStatus();
  s.scale_ready = false;
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  seedPrimedInventory("bourbon");
  const CommandParseResult r = parseCopy("pour bourbon 30", s);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kScaleNotReady), static_cast<int>(r.reject));
}

void test_pour_reject_aggregate_total_ml() {
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(g_config.setBinding(1, "simple"));
  seedPrimedInventory("bourbon");
  seedPrimedInventory("simple");
  TEST_ASSERT_TRUE(g_config.setCalibration(0, 10.0f, 100));
  TEST_ASSERT_TRUE(g_config.setCalibration(1, 10.0f, 100));
  char line[128];
  snprintf(line, sizeof(line), "pour bourbon 250 simple 251");
  const CommandParseResult r =
      parseCommandLine(line, idleStatus(), kNumPumps, g_config, g_inventory);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadMl), static_cast<int>(r.reject));
}

void test_pour_reject_not_primed() {
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  g_inventory.seedOnBinding("bourbon");
  const CommandParseResult r = parseCopy("pour bourbon 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNotPrimed), static_cast<int>(r.reject));
}

void test_pour_reject_low_inventory() {
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  seedPrimedInventory("bourbon", 35.0f);
  const CommandParseResult r = parseCopy("pour bourbon 30", idleStatus());
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kLowInventory), static_cast<int>(r.reject));
}

void test_validate_pour_preflight_matches_runner() {
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  PourSequenceStep steps[1];
  strncpy(steps[0].ingredient_id, "bourbon", kIngredientIdMax);
  steps[0].ml = 30.0f;
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kNone),
                    static_cast<int>(validatePourSequenceSteps(steps, 1, kNumPumps, g_config)));
  strncpy(steps[0].ingredient_id, "rye", kIngredientIdMax);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kBadIngredient),
                    static_cast<int>(validatePourSequenceSteps(steps, 1, kNumPumps, g_config)));
}

void test_pour_reject_duplicate_ingredient_aggregate_inventory() {
  TEST_ASSERT_TRUE(g_config.setBinding(0, "bourbon"));
  seedPrimedInventory("bourbon", 100.0f);
  PourSequenceCommand seq = {};
  seq.step_count = 2;
  std::strncpy(seq.steps[0].ingredient_id, "bourbon", kIngredientIdMax - 1);
  seq.steps[0].ml = 60.0f;
  std::strncpy(seq.steps[1].ingredient_id, "bourbon", kIngredientIdMax - 1);
  seq.steps[1].ml = 55.0f;
  const CommandReject reject =
      preflightPourSequenceEnqueue(seq, idleStatus(), kNumPumps, g_config, g_inventory);
  TEST_ASSERT_EQUAL(static_cast<int>(CommandReject::kLowInventory), static_cast<int>(reject));
}

void test_job_reject_unbound_and_calibration_text() {
  TEST_ASSERT_EQUAL_STRING("unbound-ingredient", jobRejectText(JobReject::kUnboundIngredient));
  TEST_ASSERT_EQUAL_STRING("bad-calibration", jobRejectText(JobReject::kBadCalibration));
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
  RUN_TEST(test_cancel_then_dispense_same_poll);
  RUN_TEST(test_reject_busy_when_command_pending);
  RUN_TEST(test_reject_scale_not_ready);
  RUN_TEST(test_dispense_open_ok_when_scale_not_ready);
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
  RUN_TEST(test_valid_prime);
  RUN_TEST(test_valid_prime_stop);
  RUN_TEST(test_prime_stop_rejects_during_dispense);
  RUN_TEST(test_prime_stop_ok_during_prime);
  RUN_TEST(test_prime_bad_pump);
  RUN_TEST(test_prime_reject_busy);
  RUN_TEST(test_prime_stop_not_bare_stop);
  RUN_TEST(test_prime_usage_missing_args);
  RUN_TEST(test_prime_trailing_rejects);
  RUN_TEST(test_job_reject_prime_timeout_text);
  RUN_TEST(test_pour_two_step_ok);
  RUN_TEST(test_pour_unbound_ingredient);
  RUN_TEST(test_pour_reject_when_sequence_busy);
  RUN_TEST(test_pour_reject_scale_not_ready);
  RUN_TEST(test_pour_reject_aggregate_total_ml);
  RUN_TEST(test_pour_reject_not_primed);
  RUN_TEST(test_pour_reject_low_inventory);
  RUN_TEST(test_pour_reject_duplicate_ingredient_aggregate_inventory);
  RUN_TEST(test_validate_pour_preflight_matches_runner);
  RUN_TEST(test_job_reject_unbound_and_calibration_text);
  return UNITY_END();
}
