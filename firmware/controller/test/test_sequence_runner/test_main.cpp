#include <unity.h>

#include <cmath>
#include <cstddef>
#include <cstring>
#include <vector>

#include "command_queue.h"
#include "config.h"
#include "config_store.h"
#include "coordinator.h"
#include "gpio_ops.h"
#include "inventory_store.h"
#include "job_status.h"
#include "pump_bus.h"
#include "scale_ops.h"
#include "scale_platform.h"
#include "sequence_runner.h"
#include "status_snapshot.h"

namespace {

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
    const std::size_t i = grams_idx % grams.size();
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

bool nvsBegin(const char*) {
  return true;
}
bool nvsGetBlob(const char*, void*, std::size_t) {
  return false;
}
bool nvsSetBlob(const char*, const void*, std::size_t) {
  return true;
}
NvsOps makeNvsOps() {
  return NvsOps{nvsBegin, nvsGetBlob, nvsSetBlob};
}

struct Harness {
  FakeGpio gpio;
  FakeScale scale_fake;
  PumpBus pumps;
  ScalePlatform scale;
  ConfigStore config;
  InventoryStore inventory;
  Coordinator coordinator;
  SequenceRunner sequence;
  GpioOps gpio_ops;
  ScaleOps scale_ops;
  NvsOps nvs_ops;

  void begin() {
    g_gpio = &gpio;
    g_scale = &scale_fake;
    gpio_ops = makeGpioOps();
    scale_ops = makeScaleOps();
    nvs_ops = makeNvsOps();
    pumps.begin(gpio_ops);
    scale.begin(scale_ops);
    config.begin(nvs_ops);
    inventory.begin(nvs_ops);
    coordinator.begin(pumps, scale, config);
    sequence.begin(coordinator, config, inventory, pumps, scale);
    gpio.reset();
  }

  void seedPrimed(const char* ingredient, float remaining_ml = 750.0f) {
    inventory.seedOnBinding(ingredient);
    inventory.setRemainingMl(ingredient, remaining_ml);
    inventory.setPrimed(ingredient, true);
  }

  void step(unsigned long now_ms) {
    scale.tick(now_ms);
    coordinator.tick(now_ms);
    sequence.tick(now_ms);
  }
};

constexpr float kOneSecondMl = kDefaultMlPerSecond;

PourSequenceStep makeStep(const char* ingredient, float ml) {
  PourSequenceStep step;
  strncpy(step.ingredient_id, ingredient, kIngredientIdMax - 1);
  step.ml = ml;
  return step;
}

bool pumpForwardCh(const FakeGpio& g, int in1, int in2, int pwm) {
  return g.lastDigitalLevel(in1) == kGpioLevelHigh && g.lastDigitalLevel(in2) == kGpioLevelLow &&
         g.lastAnalogDuty(pwm) > 0;
}

bool pumpStoppedCh(const FakeGpio& g, int in1, int in2, int pwm) {
  return g.lastDigitalLevel(in1) == kGpioLevelLow && g.lastDigitalLevel(in2) == kGpioLevelLow &&
         g.lastAnalogDuty(pwm) == 0;
}

void runUntilStepIndex(Harness& h, uint8_t target_index, unsigned long& now,
                       unsigned long limit_ms) {
  while (h.sequence.busy() && h.sequence.stepIndex() < target_index && now < limit_ms) {
    now += 5;
    h.step(now);
  }
}

void runUntilSequenceDone(Harness& h, unsigned long& now, unsigned long limit_ms) {
  while (h.sequence.busy() && now < limit_ms) {
    now += 5;
    h.step(now);
  }
}

void test_two_step_success() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(h.config.setBinding(1, "simple"));
  h.seedPrimed("bourbon");
  h.seedPrimed("simple");
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  PourSequenceStep steps[2] = {makeStep("bourbon", kOneSecondMl), makeStep("simple", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 2, 0));
  TEST_ASSERT_TRUE(h.sequence.busy());
  TEST_ASSERT_EQUAL(0, h.sequence.stepIndex());
  TEST_ASSERT_EQUAL_STRING("bourbon", h.sequence.currentIngredient());

  unsigned long now = 0;
  runUntilStepIndex(h, 1, now, 20000);
  TEST_ASSERT_TRUE(h.sequence.busy());
  TEST_ASSERT_EQUAL(1, h.sequence.stepIndex());
  TEST_ASSERT_EQUAL_STRING("simple", h.sequence.currentIngredient());

  runUntilSequenceDone(h, now, 40000);
  TEST_ASSERT_FALSE(h.sequence.busy());
  TEST_ASSERT_TRUE(h.sequence.ok());
}

void test_unbound_ingredient_rejected_at_preflight() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));

  PourSequenceStep steps[1] = {makeStep("rye", kOneSecondMl)};
  TEST_ASSERT_FALSE(h.sequence.start(steps, 1, 0));
  TEST_ASSERT_FALSE(h.sequence.busy());
  TEST_ASSERT_TRUE(h.sequence.error());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kUnboundIngredient),
                    static_cast<int>(h.sequence.lastReject()));
}

void test_step_two_failure_aborts_after_step_one_ok() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(h.config.setBinding(1, "simple"));
  h.seedPrimed("bourbon");
  h.seedPrimed("simple");
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  PourSequenceStep steps[2] = {makeStep("bourbon", kOneSecondMl), makeStep("simple", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 2, 0));

  unsigned long now = 0;
  runUntilStepIndex(h, 1, now, 20000);
  TEST_ASSERT_TRUE(h.sequence.busy());
  TEST_ASSERT_EQUAL(1, h.sequence.stepIndex());

  h.scale_fake.grams = {50.0f};
  h.scale_fake.grams_idx = 0;

  runUntilSequenceDone(h, now, now + kFlowDetectTimeoutMs + 2000);

  TEST_ASSERT_FALSE(h.sequence.busy());
  TEST_ASSERT_TRUE(h.sequence.error());
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kFlowTimeout),
                    static_cast<int>(h.sequence.lastReject()));
}

void test_cancel_mid_sequence() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(h.config.setBinding(1, "simple"));
  h.seedPrimed("bourbon");
  h.seedPrimed("simple");

  PourSequenceStep steps[2] = {makeStep("bourbon", kOneSecondMl), makeStep("simple", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 2, 0));
  h.step(500);
  h.sequence.cancel();

  TEST_ASSERT_FALSE(h.sequence.busy());
  TEST_ASSERT_TRUE(h.sequence.cancelled());
  TEST_ASSERT_TRUE(pumpStoppedCh(h.gpio, pins::kPump1In1, pins::kPump1In2, pins::kPump1Pwm));
}

void test_busy_when_coordinator_active() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  h.seedPrimed("bourbon");

  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = kOneSecondMl;
  cmd.flow_gate = false;
  TEST_ASSERT_TRUE(h.coordinator.startDispense(cmd, 0));

  PourSequenceStep steps[1] = {makeStep("bourbon", kOneSecondMl)};
  TEST_ASSERT_FALSE(h.sequence.start(steps, 1, 0));
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kBusy), static_cast<int>(h.sequence.lastReject()));
}

void test_flow_gate_uses_scale() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  h.seedPrimed("bourbon");
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  PourSequenceStep steps[1] = {makeStep("bourbon", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 1, 0));
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kFlowWait),
                    static_cast<int>(h.coordinator.phase()));

  h.step(1);
  h.step(2);
  h.step(3);
  h.step(4);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour),
                    static_cast<int>(h.coordinator.phase()));
}

void test_ingredient_resolves_to_bound_pump() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(1, "simple"));
  h.seedPrimed("simple");

  PourSequenceStep steps[1] = {makeStep("simple", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 1, 0));
  TEST_ASSERT_TRUE(pumpForwardCh(h.gpio, pins::kPump2In1, pins::kPump2In2, pins::kPump2Pwm));
}

void test_job_status_coordinator_not_shadowed_while_busy() {
  JobStatusInputs in;
  in.sequence_result = Coordinator::JobResult::kOk;
  in.sequence_ok = true;
  in.coordinator_busy = true;
  in.coordinator_phase = Coordinator::Phase::kPour;

  bool job_ok = true;
  bool job_error = true;
  bool job_cancelled = true;
  uint8_t job_phase = 0;
  JobReject job_reject = JobReject::kFlowTimeout;
  fillJobStatusFields(in, &job_ok, &job_error, &job_cancelled, &job_phase, &job_reject);

  TEST_ASSERT_FALSE(job_ok);
  TEST_ASSERT_FALSE(job_error);
  TEST_ASSERT_FALSE(job_cancelled);
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::Phase::kPour), static_cast<int>(job_phase));
}

void test_job_status_sequence_error_beats_coordinator_ok() {
  JobStatusInputs in;
  in.sequence_result = Coordinator::JobResult::kError;
  in.sequence_error = true;
  in.sequence_reject = JobReject::kBadMl;
  in.coordinator_ok = true;

  bool job_ok = true;
  bool job_error = false;
  bool job_cancelled = false;
  uint8_t job_phase = 0;
  JobReject job_reject = JobReject::kNone;
  fillJobStatusFields(in, &job_ok, &job_error, &job_cancelled, &job_phase, &job_reject);

  TEST_ASSERT_FALSE(job_ok);
  TEST_ASSERT_TRUE(job_error);
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kBadMl), static_cast<int>(job_reject));
}

void test_job_status_coordinator_error_after_sequence_cleared() {
  JobStatusInputs in;
  in.sequence_result = Coordinator::JobResult::kNone;
  in.coordinator_error = true;
  in.coordinator_reject = JobReject::kFlowTimeout;

  bool job_ok = false;
  bool job_error = false;
  bool job_cancelled = false;
  uint8_t job_phase = 0;
  JobReject job_reject = JobReject::kNone;
  fillJobStatusFields(in, &job_ok, &job_error, &job_cancelled, &job_phase, &job_reject);

  TEST_ASSERT_FALSE(job_ok);
  TEST_ASSERT_TRUE(job_error);
  TEST_ASSERT_EQUAL(static_cast<int>(JobReject::kFlowTimeout), static_cast<int>(job_reject));
}

void test_unbind_mid_sequence_does_not_change_resolved_step() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(h.config.setBinding(1, "simple"));
  h.seedPrimed("bourbon");
  h.seedPrimed("simple");
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  PourSequenceStep steps[2] = {makeStep("bourbon", kOneSecondMl), makeStep("simple", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 2, 0));

  unsigned long now = 0;
  runUntilStepIndex(h, 1, now, 20000);
  h.config.clearBinding(1);

  h.step(now + 5);
  TEST_ASSERT_TRUE(h.coordinator.busy());
  TEST_ASSERT_TRUE(pumpForwardCh(h.gpio, pins::kPump2In1, pins::kPump2In2, pins::kPump2Pwm));
}

void test_clear_terminal_result_before_coordinator_job() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  h.seedPrimed("bourbon");
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  PourSequenceStep steps[1] = {makeStep("bourbon", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 1, 0));
  unsigned long now = 0;
  runUntilSequenceDone(h, now, 20000);
  TEST_ASSERT_TRUE(h.sequence.ok());

  h.sequence.clearTerminalResult();
  TEST_ASSERT_EQUAL(static_cast<int>(Coordinator::JobResult::kNone),
                    static_cast<int>(h.sequence.result()));

  h.scale_fake.grams = {50.0f};
  h.scale_fake.grams_idx = 0;
  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = kOneSecondMl;
  cmd.flow_gate = true;
  TEST_ASSERT_TRUE(h.coordinator.startDispense(cmd, now + 5000));

  JobStatusInputs in;
  in.sequence_result = h.sequence.result();
  in.coordinator_busy = h.coordinator.busy();
  in.coordinator_phase = h.coordinator.phase();
  bool job_ok = true;
  bool job_error = false;
  bool job_cancelled = false;
  uint8_t job_phase = 0;
  JobReject job_reject = JobReject::kNone;
  fillJobStatusFields(in, &job_ok, &job_error, &job_cancelled, &job_phase, &job_reject);
  TEST_ASSERT_FALSE(job_ok);
  TEST_ASSERT_FALSE(job_error);
}

void test_per_step_inventory_subtract_on_partial_failure() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(h.config.setBinding(1, "simple"));
  h.seedPrimed("bourbon", 200.0f);
  h.seedPrimed("simple", 200.0f);
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  PourSequenceStep steps[2] = {makeStep("bourbon", kOneSecondMl), makeStep("simple", kOneSecondMl)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 2, 0));

  unsigned long now = 0;
  runUntilStepIndex(h, 1, now, 20000);
  TEST_ASSERT_EQUAL_FLOAT(200.0f - kOneSecondMl, h.inventory.find("bourbon")->remaining_ml);
  TEST_ASSERT_EQUAL_FLOAT(200.0f, h.inventory.find("simple")->remaining_ml);

  h.scale_fake.grams = {50.0f};
  h.scale_fake.grams_idx = 0;
  runUntilSequenceDone(h, now, now + kFlowDetectTimeoutMs + 2000);

  TEST_ASSERT_TRUE(h.sequence.error());
  TEST_ASSERT_EQUAL_FLOAT(200.0f - kOneSecondMl, h.inventory.find("bourbon")->remaining_ml);
  TEST_ASSERT_EQUAL_FLOAT(200.0f, h.inventory.find("simple")->remaining_ml);
}

void test_progress_weighted_by_step_duration() {
  Harness h;
  h.begin();
  TEST_ASSERT_TRUE(h.config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(h.config.setBinding(1, "simple"));
  // Same ml/s, zero anti-drip: durations scale with ml (45 vs 10 → 82% after first step).
  TEST_ASSERT_TRUE(h.config.setCalibration(0, kDefaultMlPerSecond, 0));
  TEST_ASSERT_TRUE(h.config.setCalibration(1, kDefaultMlPerSecond, 0));
  h.seedPrimed("bourbon");
  h.seedPrimed("simple");
  h.scale_fake.grams = {100.0f, 100.1f, 100.2f, 100.3f, 100.3f};

  PourSequenceStep steps[2] = {makeStep("bourbon", 45.0f), makeStep("simple", 10.0f)};
  TEST_ASSERT_TRUE(h.sequence.start(steps, 2, 0));
  TEST_ASSERT_EQUAL(0, h.sequence.progressPercent(0));
  TEST_ASSERT_EQUAL(40, h.sequence.progressPercent(50));  // half of 45/55

  unsigned long now = 0;
  runUntilStepIndex(h, 1, now, 60000);
  TEST_ASSERT_EQUAL(1, h.sequence.stepIndex());
  TEST_ASSERT_EQUAL(81, h.sequence.progressPercent(0));  // 45/55
  TEST_ASSERT_EQUAL(90, h.sequence.progressPercent(50)); // 45/55 + half of 10/55
}

}  // namespace

void setUp() {
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_two_step_success);
  RUN_TEST(test_unbound_ingredient_rejected_at_preflight);
  RUN_TEST(test_step_two_failure_aborts_after_step_one_ok);
  RUN_TEST(test_cancel_mid_sequence);
  RUN_TEST(test_busy_when_coordinator_active);
  RUN_TEST(test_flow_gate_uses_scale);
  RUN_TEST(test_ingredient_resolves_to_bound_pump);
  RUN_TEST(test_job_status_coordinator_not_shadowed_while_busy);
  RUN_TEST(test_job_status_sequence_error_beats_coordinator_ok);
  RUN_TEST(test_job_status_coordinator_error_after_sequence_cleared);
  RUN_TEST(test_unbind_mid_sequence_does_not_change_resolved_step);
  RUN_TEST(test_clear_terminal_result_before_coordinator_job);
  RUN_TEST(test_per_step_inventory_subtract_on_partial_failure);
  RUN_TEST(test_progress_weighted_by_step_duration);
  return UNITY_END();
}
