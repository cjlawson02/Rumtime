#include <unity.h>

#include <cmath>
#include <cstddef>
#include <limits>
#include <vector>

#include "command_queue.h"
#include "config.h"
#include "config_store.h"
#include "coordinator.h"
#include "gpio_ops.h"
#include "machine_inputs.h"
#include "pump_bus.h"
#include "scale_ops.h"
#include "scale_platform.h"
#include "status_snapshot.h"

namespace {

// --- Fake GPIO (records TB6612 writes so tests can read pump direction/PWM) ---

enum class OpType { kPinMode, kDigitalWrite, kAnalogWrite };

struct WriteOp {
  OpType type;
  int pin;
  int value;
};

class FakeGpio {
 public:
  void reset() {
    writes.clear();
  }
  void pinMode(int pin, uint8_t mode) {
    writes.push_back({OpType::kPinMode, pin, mode});
  }
  void digitalWrite(int pin, uint8_t level) {
    writes.push_back({OpType::kDigitalWrite, pin, level});
  }
  void analogWrite(int pin, int duty) {
    writes.push_back({OpType::kAnalogWrite, pin, duty});
  }
  int count(OpType type, int pin, int value) const {
    int total = 0;
    for (const WriteOp& op : writes) {
      if (op.type == type && op.pin == pin && op.value == value) {
        ++total;
      }
    }
    return total;
  }
  int lastAnalogDuty(int pin) const {
    for (std::size_t i = writes.size(); i > 0; --i) {
      const WriteOp& op = writes[i - 1];
      if (op.type == OpType::kAnalogWrite && op.pin == pin) {
        return op.value;
      }
    }
    return -1;
  }
  int lastDigitalLevel(int pin) const {
    for (std::size_t i = writes.size(); i > 0; --i) {
      const WriteOp& op = writes[i - 1];
      if (op.type == OpType::kDigitalWrite && op.pin == pin) {
        return op.value;
      }
    }
    return -1;
  }
  std::vector<WriteOp> writes;
};

FakeGpio* g_gpio = nullptr;
void gpioPinMode(int pin, uint8_t mode) {
  g_gpio->pinMode(pin, mode);
}
void gpioDigitalWrite(int pin, uint8_t level) {
  g_gpio->digitalWrite(pin, level);
}
void gpioAnalogWrite(int pin, int duty) {
  g_gpio->analogWrite(pin, duty);
}
GpioOps makeGpioOps() {
  return GpioOps{gpioPinMode, gpioDigitalWrite, gpioAnalogWrite};
}

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
  return 0;
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
bool nvsCommit() {
  return true;
}
NvsOps makeNvsOps() {
  return NvsOps{nvsBegin, nvsGetBlob, nvsSetBlob, nvsCommit};
}

// --- Test harness bundling the real subsystems the coordinator drives ---

struct Harness {
  FakeGpio gpio;
  FakeScale scale_fake;
  MachineInputs inputs;
  PumpBus pumps;
  ScalePlatform scale;
  ConfigStore config;
  Coordinator coordinator;
  GpioOps gpio_ops;
  ScaleOps scale_ops;
  NvsOps nvs_ops;

  void begin() {
    g_gpio = &gpio;
    g_scale = &scale_fake;
    gpio_ops = makeGpioOps();
    scale_ops = makeScaleOps();
    nvs_ops = makeNvsOps();
    pumps.begin(inputs, gpio_ops);
    scale.begin(scale_ops);
    config.begin(nvs_ops);
    coordinator.begin(pumps, scale, config);
    gpio.reset();  // drop safe-boot writes; keep only job-driven writes
  }

  // One ControlTask control period: pump safety -> scale FSM -> coordinator FSM.
  void step(unsigned long now_ms) {
    pumps.tick();
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

// Pump 1 (channel 0) direction predicates via recorded GPIO writes.
bool pumpForward(const FakeGpio& g) {
  return g.lastDigitalLevel(pins::kPump1In1) == kGpioLevelHigh &&
         g.lastDigitalLevel(pins::kPump1In2) == kGpioLevelLow &&
         g.lastAnalogDuty(pins::kPump1Pwm) > 0;
}
bool pumpReverse(const FakeGpio& g) {
  return g.lastDigitalLevel(pins::kPump1In1) == kGpioLevelLow &&
         g.lastDigitalLevel(pins::kPump1In2) == kGpioLevelHigh &&
         g.lastAnalogDuty(pins::kPump1Pwm) > 0;  // reverse must actually purge
}
bool pumpStopped(const FakeGpio& g) {
  return g.lastDigitalLevel(pins::kPump1In1) == kGpioLevelLow &&
         g.lastDigitalLevel(pins::kPump1In2) == kGpioLevelLow &&
         g.lastAnalogDuty(pins::kPump1Pwm) == 0;
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
  TEST_ASSERT_TRUE(pumpForward(h.gpio));

  h.step(500);  // mid-pour
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.gpio));

  h.step(1000);  // pour deadline -> anti-drip reverse
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpReverse(h.gpio));

  h.step(1000 + kDefaultAntiDripMs);  // anti-drip deadline -> done
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.ok());
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
}

void test_flow_gate_detect_then_pour_from_flow_onset() {
  Harness h;
  h.begin();
  // Baseline then deltas above the 0.03 g flow threshold.
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, true), 0));
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));
  TEST_ASSERT_TRUE(pumpForward(h.gpio));

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
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
}

void test_flow_gate_timeout_aborts() {
  Harness h;
  h.begin();
  h.scale_fake.grams = {50.0f};  // flat weight -> never any flow

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, true), 0));
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));

  // Tick frequently so the scale keeps converting (never stale); only the
  // wall-clock flow timeout should end the job.
  unsigned long now = 0;
  while (h.coordinator.busy() && now <= kFlowDetectTimeoutMs + 500) {
    now += 200;
    h.step(now);
  }

  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_TRUE(h.scale.flowTimedOut());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kFlowTimeout),
                    static_cast<int>(h.coordinator.lastReject()));
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
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
  TEST_ASSERT_TRUE(pumpForward(h.gpio));
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
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
}

void test_cancel_aborts_immediately_without_anti_drip() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  h.step(500);
  TEST_ASSERT_TRUE(pumpForward(h.gpio));

  h.coordinator.cancel();
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_FALSE(h.coordinator.ok());
  TEST_ASSERT_FALSE(h.coordinator.error());
  TEST_ASSERT_TRUE(h.coordinator.cancelled());
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
  // Cancel skips anti-drip: pump 1 was never driven in reverse.
  TEST_ASSERT_EQUAL(0, h.gpio.count(OpType::kDigitalWrite, pins::kPump1In2, kGpioLevelHigh));
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

void test_reject_cutoff_open() {
  Harness h;
  h.begin();
  h.inputs.setCutoffOpen(true);

  TEST_ASSERT_FALSE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kCutoffOpen),
                    static_cast<int>(h.coordinator.lastReject()));
  TEST_ASSERT_EQUAL(0, h.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
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
  TEST_ASSERT_TRUE(pumpForward(h.gpio));

  h.step(start + 999UL);  // wraps around 0; elapsed = 999 ms, still pouring
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
  h.step(start + 1000UL);  // elapsed = 1000 ms -> anti-drip despite the wrap
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kAntiDrip),
                    static_cast<int>(h.coordinator.phase()));
  h.step(start + 1000UL + kDefaultAntiDripMs);
  TEST_ASSERT_TRUE(h.coordinator.ok());
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
}

void test_cutoff_open_during_flow_wait_aborts() {
  Harness h;
  h.begin();
  h.scale_fake.grams = {50.0f};  // flat, ready -> stays in flow wait

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, true), 0));
  h.step(1);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));

  h.inputs.setCutoffOpen(true);  // rocker opens while waiting for flow
  h.step(2);
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
}

void test_cancel_when_idle_is_noop() {
  Harness h;
  h.begin();

  h.coordinator.cancel();  // must not crash or start a job
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_FALSE(h.coordinator.ok());
}

void test_cutoff_open_mid_pour_aborts() {
  Harness h;
  h.begin();

  TEST_ASSERT_TRUE(h.coordinator.startDispense(dispenseCmd(0, kOneSecondMl, false), 0));
  h.step(200);
  TEST_ASSERT_TRUE(pumpForward(h.gpio));

  h.inputs.setCutoffOpen(true);  // rocker opens mid-pour
  h.step(400);
  TEST_ASSERT_FALSE(h.coordinator.busy());
  TEST_ASSERT_TRUE(h.coordinator.error());
  TEST_ASSERT_TRUE(pumpStopped(h.gpio));
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
  RUN_TEST(test_reject_cutoff_open);
  RUN_TEST(test_reject_invalid_channel);
  RUN_TEST(test_reject_non_positive_ml);
  RUN_TEST(test_reject_channel_at_bound);
  RUN_TEST(test_reject_over_max_ml);
  RUN_TEST(test_reject_non_finite_ml);
  RUN_TEST(test_reject_pour_exceeds_max_duration);
  RUN_TEST(test_reject_sub_resolution_ml);
  RUN_TEST(test_second_job_clears_prior_result);
  RUN_TEST(test_timed_dispense_survives_millis_rollover);
  RUN_TEST(test_cutoff_open_during_flow_wait_aborts);
  RUN_TEST(test_cancel_when_idle_is_noop);
  RUN_TEST(test_cutoff_open_mid_pour_aborts);
  RUN_TEST(test_custom_ml_per_s_extends_pour_duration);
  RUN_TEST(test_custom_anti_drip_ms);
  RUN_TEST(test_mid_pour_cal_does_not_change_running_job);
  return UNITY_END();
}
