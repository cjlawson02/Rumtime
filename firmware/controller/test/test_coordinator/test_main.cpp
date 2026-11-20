#include <unity.h>

#include <cmath>
#include <cstddef>
#include <limits>
#include <vector>

#include "../support/fake_pump_io.h"
#include "command_queue.h"
#include "config.h"
#include "config_store.h"
#include "coordinator.h"
#include "gpio_ops.h"
#include "i2c_ops.h"
#include "pump_bus.h"
#include "pump_module.h"
#include "scale_ops.h"
#include "scale_platform.h"
#include "status_snapshot.h"

namespace {

// --- Fake scale (feeds scripted grams; toggles ready) ---

class FakeScale {
 public:
  std::vector<float> grams;
  std::size_t grams_idx = 0;
  bool wait_ready_result = true;
  bool is_ready_result = true;

  float nextGrams() {
    if (grams.empty()) {
      return 0.0f;
    }
    const std::size_t i = grams_idx < grams.size() ? grams_idx : grams.size() - 1;
    ++grams_idx;
    return grams[i];
  }
};

FakeScale* g_scale = nullptr;
void scaleBegin(int, int) {
}
bool scaleWaitReady(unsigned long) {
  return g_scale->wait_ready_result;
}
bool scaleIsReady() {
  return g_scale->is_ready_result;
}
float scaleGetUnits() {
  return g_scale->nextGrams();
}
long scaleReadRaw() {
  static long noise = 0;
  return 1000 + (noise++ % 7);  // live ADC noise (passes the boot probe)
}
void scaleSetScale(float) {
}
void scaleSetOffset(long) {
}
ScaleOps makeScaleOps() {
  return ScaleOps{scaleBegin,   scaleWaitReady, scaleIsReady,  scaleGetUnits,
                  scaleReadRaw, scaleSetScale,  scaleSetOffset};
}

// --- Fake NVS: no stored record -> ConfigStore seeds config.h defaults, so the
// coordinator's per-pump ml/s + anti-drip equal the constants these tests assume.

bool nvsBegin(const char*) {
  return true;
}
bool nvsGetBlob(const char*, void*, std::size_t) {
  return false;  // nothing persisted
}
bool nvsSetBlob(const char*, const void*, std::size_t) {
  return true;
}
NvsOps makeNvsOps() {
  return NvsOps{nvsBegin, nvsGetBlob, nvsSetBlob};
}

// --- Test harness bundling the real subsystems the coordinator drives ---

struct Harness {
  FakeGpio gpio;
  FakeI2c i2c;
  FakeScale scale_fake;
  PumpBus pumps;
  ScalePlatform scale;
  ConfigStore config;
  Coordinator coordinator;
  GpioOps gpio_ops;
  I2cOps i2c_ops;
  ScaleOps scale_ops;
  NvsOps nvs_ops;

  void begin() {
    g_gpio = &gpio;
    g_i2c = &i2c;
    g_scale = &scale_fake;
    gpio_ops = kFakeGpioOps;
    i2c_ops = kFakeI2cOps;
    scale_ops = makeScaleOps();
    nvs_ops = makeNvsOps();
    pumps.begin(gpio_ops, i2c_ops);
    scale.begin(scale_ops);
    config.begin(nvs_ops);
    coordinator.begin(pumps, scale, config);
    gpio.reset();  // drop safe-boot writes; keep only job-driven writes
    i2c.reset();
    i2c.present[0] = true;
  }

  // One ControlTask control period: pump safety -> scale FSM -> coordinator FSM.
  void step(unsigned long now_ms) {
    scale.tick(now_ms);
    coordinator.tick(now_ms);
  }
};

DispenseCommand dispenseCmd(uint8_t channel, float ml, bool flow_gate) {
  DispenseCommand cmd;
  cmd.channel = channel;
  cmd.ml = ml;
  cmd.flow_gate = flow_gate;
  return cmd;
}

// Pump 1 (channel 0) via MCP23017 OLAT bits (forwardBits/reverseBits: seed polarity).
bool pumpForward(const FakeI2c& i2c) {
  return i2c.channelBits(0) == forwardBits() &&
         g_gpio->lastDigitalLevel(pins::kStandby) == kGpioLevelHigh;
}
bool pumpReverse(const FakeI2c& i2c) {
  return i2c.channelBits(0) == reverseBits() &&
         g_gpio->lastDigitalLevel(pins::kStandby) == kGpioLevelHigh;
}
bool pumpStopped(const FakeI2c& i2c) {
  return i2c.channelBits(0) == 0;
}
bool historyHadReverse(const FakeI2c& i2c) {
  const uint8_t rev = reverseBits();
  for (uint8_t value : i2c.olat_history) {
    if (((value >> (FakeI2c::pairOf(0) * 2)) & 0x3) == rev) {
      return true;
    }
  }
  return false;
}

// ml == kDefaultMlPerSecond -> pour lasts exactly 1000 ms.
constexpr float kOneSecondMl = kDefaultMlPerSecond;

void test_timed_dispense_runs_then_anti_drip_then_ok() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  TEST_ASSERT_TRUE(h.coordinator.busy());
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.i2c));

  h.step(500);  // mid-pour
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.i2c));

  h.step(1000);  // pour deadline -> anti-drip reverse
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpReverse(h.i2c));

  h.step(1000 + kDefaultAntiDripMs);  // anti-drip deadline -> done
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.ok());
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
}

void test_flow_gate_detect_then_pour_from_flow_onset() {
  Harness h;
  h.begin();
  // Baseline then deltas above the 0.03 g flow threshold.
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, true), 0));
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.i2c));

  h.step(1);  // baseline conversion
  h.step(2);  // delta 1
  h.step(3);  // delta 2
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));
  h.step(4);  // delta 3 -> flow detected -> pour starts here
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));

  // Pour deadline is measured from flow onset (now=4), not from motor-on.
  h.step(4 + 999);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  h.step(4 + 1000);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
  h.step(4 + 1000 + kDefaultAntiDripMs);
  TEST_ASSERT_TRUE(h.coordinator.ok());
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
}

void test_flow_gate_timeout_aborts() {
  Harness h;
  h.begin();
  h.scale_fake.grams = {50.0f};  // flat weight -> never any flow

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, true), 0));
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));

  // Flow-wait is capped at min(pour_ms, kFlowDetectTimeoutMs) — 1 s pour aborts
  // before the scale's 5 s no-flow timeout when no flow is detected.
  unsigned long now = 0;
  while (h.coordinator.busy() && now <= 1500) {
    now += 200;
    h.step(now);
  }

  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kFlowTimeout),
                    static_cast<int>(h.coordinator.lastReject()));
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
}

void test_flow_gate_scale_not_ready_rejects() {
  Harness h;
  h.scale_fake = FakeScale{};
  h.scale_fake.wait_ready_result = false;  // scale never initializes -> not ready
  h.begin();

  TEST_ASSERT_FALSE(h.scale.ready());
  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, true), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kScaleNotReady),
                    static_cast<int>(h.coordinator.lastReject()));
}

void test_dispense_open_works_without_scale() {
  Harness h;
  h.scale_fake = FakeScale{};
  h.scale_fake.wait_ready_result = false;
  h.begin();

  TEST_ASSERT_FALSE(h.scale.ready());
  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.i2c));
}

void test_scale_not_ready_during_flow_wait_aborts() {
  Harness h;
  h.begin();
  h.scale_fake.grams = {50.0f};  // flat, ready at first

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, true), 0));
  h.step(1);  // one good conversion; still in flow wait, scale ready
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));

  // Scale stops converting; after the stale window it reads not-ready, which must
  // abort the pour before the (longer) no-flow timeout.
  h.scale_fake.is_ready_result = false;
  h.step(1 + kScaleStaleTimeoutMs + 1);
  TEST_ASSERT_FALSE(h.scale.ready());
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_FALSE(h.scale.flowTimedOut());  // aborted on not-ready, not timeout
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
}

void test_cancel_aborts_immediately_without_anti_drip() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  h.step(500);
  TEST_ASSERT_TRUE(pumpForward(h.i2c));

  h.coordinator.cancel();
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_FALSE(h.coordinator.ok());
  TEST_ASSERT_FALSE(h.coordinator.error());
  TEST_ASSERT_TRUE(h.coordinator.cancelled());
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
  // Cancel skips anti-drip: pump 1 was never driven in reverse.
  TEST_ASSERT_FALSE(historyHadReverse(h.i2c));
}

void test_reject_when_busy() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  // A duplicate dispense while busy is rejected and does not disturb the job.
  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(1, kOneSecondMl, false), 0));
  TEST_ASSERT_TRUE(h.coordinator.busy());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kBusy),
                    static_cast<int>(h.coordinator.lastReject()));
  TEST_ASSERT_FALSE(h.coordinator.error());
}

void test_reject_invalid_channel() {
  Harness h;
  h.begin();

  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(5, kOneSecondMl, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
}

void test_reject_non_positive_ml() {
  Harness h;
  h.begin();

  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, 0.0f, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
}

void test_reject_channel_at_bound() {
  Harness h;
  h.begin();
  // The first invalid channel is exactly kNumChannels (0-based channels are
  // 0..kNumChannels-1); the boundary must be rejected, not just far values.
  TEST_ASSERT_FALSE(
      h.coordinator.startDispense(dispenseCmd(PumpBus::kNumChannels, kOneSecondMl, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
}

void test_reject_over_max_ml() {
  Harness h;
  h.begin();
  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, kMaxDispenseMl + 1.0f, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_EQUAL(0, h.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
}

void test_reject_non_finite_ml() {
  Harness h;
  h.begin();
  const float nan_ml = std::numeric_limits<float>::quiet_NaN();
  const float inf_ml = std::numeric_limits<float>::infinity();
  // NaN/Inf slip past a naive `ml <= 0` guard and cast to garbage pour lengths.
  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, nan_ml, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, inf_ml, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_EQUAL(0, h.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
}

void test_reject_pour_exceeds_max_duration() {
  Harness h;
  h.begin();
  // ml within kMaxDispenseMl but whose (ml / ml_per_s) pour blows past the hard
  // duration ceiling must be rejected, not silently clamped to a short pour.
  const float too_long_ml =
      (static_cast<float>(kMaxPourDurationMs) / 1000.0f) * kDefaultMlPerSecond + 10.0f;
  TEST_ASSERT_TRUE(too_long_ml <= kMaxDispenseMl);  // guard the test's premise
  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, too_long_ml, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
}

void test_reject_sub_resolution_ml() {
  Harness h;
  h.begin();
  // ml so small the pour rounds to 0 ms would jump straight to anti-drip suck-back.
  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, 0.0001f, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
}

void test_second_job_clears_prior_result() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  h.step(1000);
  h.step(1000 + kDefaultAntiDripMs);
  TEST_ASSERT_TRUE(h.coordinator.ok());

  // Starting a fresh job clears the prior success flag while it runs.
  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 2000));
  TEST_ASSERT_FALSE(h.coordinator.ok());
  TEST_ASSERT_FALSE(h.coordinator.error());
}

void test_timed_dispense_survives_millis_rollover() {
  Harness h;
  h.begin();
  // Start just before the millis() wrap so the pour deadline straddles it.
  const unsigned long start = std::numeric_limits<unsigned long>::max() - 500UL;
  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), start));
  TEST_ASSERT_TRUE(pumpForward(h.i2c));

  h.step(start + 999UL);  // wraps around 0; elapsed = 999 ms, still pouring
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  h.step(start + 1000UL);  // elapsed = 1000 ms -> anti-drip despite the wrap
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
  h.step(start + 1000UL + kDefaultAntiDripMs);
  TEST_ASSERT_TRUE(h.coordinator.ok());
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
}

void test_cancel_when_idle_is_noop() {
  Harness h;
  h.begin();

  h.coordinator.cancel();  // must not crash or start a job
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_FALSE(h.coordinator.ok());
}

void test_custom_ml_per_s_extends_pour_duration() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setCalibration(0, 3.5f, static_cast<uint32_t>(kDefaultAntiDripMs)));

  constexpr float kPourMl = 3.5f;  // 3.5 ml @ 3.5 ml/s -> 1000 ms pour
  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kPourMl, false), 0));
  h.step(999);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  h.step(1000);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
  h.step(1000 + kDefaultAntiDripMs);
  TEST_ASSERT_TRUE(h.coordinator.ok());
}

void test_custom_anti_drip_ms() {
  Harness h;
  h.begin();
  constexpr uint32_t kCustomAntiDrip = 200;
  TEST_ASSERT_TRUE(h.config.setCalibration(0, kDefaultMlPerSecond, kCustomAntiDrip));

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  h.step(1000);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
  h.step(1000 + kCustomAntiDrip - 1);
  TEST_ASSERT_TRUE(h.coordinator.busy());
  h.step(1000 + kCustomAntiDrip);
  TEST_ASSERT_TRUE(h.coordinator.ok());
}

void test_mid_pour_cal_does_not_change_running_job() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  h.step(500);
  // Double the pour rate mid-job — the running pour must keep the captured duration.
  TEST_ASSERT_TRUE(h.config.setCalibration(0, 3.5f, 100));

  h.step(999);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  h.step(1000);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
}

void test_prime_runs_forward_continuously() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startPrime(0, 0));
  TEST_ASSERT_TRUE(h.coordinator.busy());
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPrime),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.i2c));

  h.step(5000);
  TEST_ASSERT_TRUE(h.coordinator.busy());
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPrime),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.i2c));
}

void test_prime_stop_completes_ok_without_anti_drip() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startPrime(0, 0));
  h.step(3000);
  TEST_ASSERT_TRUE(pumpForward(h.i2c));

  h.coordinator.stopPrime();
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.ok());
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
  TEST_ASSERT_FALSE(historyHadReverse(h.i2c));
}

void test_prime_timeout_errors_without_anti_drip() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startPrime(0, 0));
  h.step(kMaxPrimeDurationMs);
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kPrimeTimeout),
                    static_cast<int>(h.coordinator.lastReject()));
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
  TEST_ASSERT_FALSE(historyHadReverse(h.i2c));
}

void test_cancel_during_prime_aborts_without_anti_drip() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startPrime(0, 0));
  h.step(2000);
  h.coordinator.cancel();
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.cancelled());
  TEST_ASSERT_TRUE(pumpStopped(h.i2c));
  TEST_ASSERT_FALSE(historyHadReverse(h.i2c));
}

void test_reject_prime_when_busy() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startPrime(0, 0));
  TEST_ASSERT_FALSE(h.coordinator.startPrime(1, 100));
  TEST_ASSERT_TRUE(h.coordinator.busy());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kBusy),
                    static_cast<int>(h.coordinator.lastReject()));
}

void test_stop_prime_when_idle_is_noop() {
  Harness h;
  h.begin();

  h.coordinator.stopPrime();
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_FALSE(h.coordinator.ok());
}

void test_dispense_on_missing_module_rejected_before_motion() {
  Harness h;
  h.begin();  // only module 0x20 present

  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(4, kOneSecondMl, false), 0));
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kBadChannel),
                    static_cast<int>(h.coordinator.lastReject()));
  TEST_ASSERT_FALSE(h.coordinator.startPrime(9, 0));
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kBadChannel),
                    static_cast<int>(h.coordinator.lastReject()));
  TEST_ASSERT_FALSE(h.pumps.anyRunning());
}

void test_pour_fails_when_bus_stopped_underneath() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  h.step(100);
  TEST_ASSERT_TRUE(h.coordinator.busy());

  // A failed expander write elsewhere stops the whole bus.
  h.pumps.stopAll();
  h.step(105);
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kPumpRefused),
                    static_cast<int>(h.coordinator.lastReject()));
}

}  // namespace

void setUp() {
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_timed_dispense_runs_then_anti_drip_then_ok);
  RUN_TEST(test_flow_gate_detect_then_pour_from_flow_onset);
  RUN_TEST(test_flow_gate_timeout_aborts);
  RUN_TEST(test_flow_gate_scale_not_ready_rejects);
  RUN_TEST(test_dispense_open_works_without_scale);
  RUN_TEST(test_scale_not_ready_during_flow_wait_aborts);
  RUN_TEST(test_cancel_aborts_immediately_without_anti_drip);
  RUN_TEST(test_reject_when_busy);
  RUN_TEST(test_reject_invalid_channel);
  RUN_TEST(test_reject_non_positive_ml);
  RUN_TEST(test_reject_channel_at_bound);
  RUN_TEST(test_reject_over_max_ml);
  RUN_TEST(test_reject_non_finite_ml);
  RUN_TEST(test_reject_pour_exceeds_max_duration);
  RUN_TEST(test_reject_sub_resolution_ml);
  RUN_TEST(test_second_job_clears_prior_result);
  RUN_TEST(test_timed_dispense_survives_millis_rollover);
  RUN_TEST(test_cancel_when_idle_is_noop);
  RUN_TEST(test_custom_ml_per_s_extends_pour_duration);
  RUN_TEST(test_custom_anti_drip_ms);
  RUN_TEST(test_mid_pour_cal_does_not_change_running_job);
  RUN_TEST(test_prime_runs_forward_continuously);
  RUN_TEST(test_prime_stop_completes_ok_without_anti_drip);
  RUN_TEST(test_prime_timeout_errors_without_anti_drip);
  RUN_TEST(test_cancel_during_prime_aborts_without_anti_drip);
  RUN_TEST(test_reject_prime_when_busy);
  RUN_TEST(test_stop_prime_when_idle_is_noop);
  RUN_TEST(test_dispense_on_missing_module_rejected_before_motion);
  RUN_TEST(test_pour_fails_when_bus_stopped_underneath);
  return UNITY_END();
}
