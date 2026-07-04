#include <unity.h>

#include <cstddef>
#include <vector>

#include "config.h"
#include "gpio_ops.h"
#include "machine_inputs.h"
#include "pump_bus.h"
#include "pump_channel.h"

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
    standby_high = false;
  }

  void pinMode(int pin, uint8_t mode) {
    writes.push_back({OpType::kPinMode, pin, mode});
  }

  void digitalWrite(int pin, uint8_t level) {
    writes.push_back({OpType::kDigitalWrite, pin, level});
    if (pin == pins::kStandby) {
      standby_high = (level == kGpioLevelHigh);
    }
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
  bool standby_high = false;
};

FakeGpio* g_fake = nullptr;

void fakePinMode(int pin, uint8_t mode) {
  g_fake->pinMode(pin, mode);
}
void fakeDigitalWrite(int pin, uint8_t level) {
  g_fake->digitalWrite(pin, level);
}
void fakeAnalogWrite(int pin, int duty) {
  g_fake->analogWrite(pin, duty);
}

GpioOps makeOps() {
  return GpioOps{
      fakePinMode,
      fakeDigitalWrite,
      fakeAnalogWrite,
  };
}

bool isChannelPin(int pin) {
  return pin == pins::kPump1In1 || pin == pins::kPump1In2 || pin == pins::kPump1Pwm ||
         pin == pins::kPump2In1 || pin == pins::kPump2In2 || pin == pins::kPump2Pwm;
}

void test_invalid_channel_returns_false_and_no_writes() {
  FakeGpio fake;
  g_fake = &fake;
  MachineInputs inputs;
  PumpBus bus;
  bus.begin(inputs, makeOps());
  fake.reset();

  TEST_ASSERT_FALSE(bus.run(42, PumpDirection::kForward, 123));
  TEST_ASSERT_EQUAL_UINT(0, fake.writes.size());
}

void test_run_before_begin_returns_false_and_no_writes() {
  FakeGpio fake;
  g_fake = &fake;
  PumpBus bus;

  TEST_ASSERT_FALSE(bus.run(0, PumpDirection::kForward, 120));
  TEST_ASSERT_EQUAL_UINT(0, fake.writes.size());
  TEST_ASSERT_FALSE(fake.standby_high);
}

void test_cutoff_open_fails_unsafe_when_inputs_unset() {
  PumpBus bus;
  TEST_ASSERT_TRUE(bus.cutoffOpen());
}

void test_cutoff_open_refuses_motion_and_never_raises_stby() {
  FakeGpio fake;
  g_fake = &fake;
  MachineInputs inputs;
  PumpBus bus;
  bus.begin(inputs, makeOps());
  fake.reset();

  inputs.setCutoffOpen(true);
  TEST_ASSERT_FALSE(bus.run(0, PumpDirection::kForward, 100));
  TEST_ASSERT_EQUAL(0, fake.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));

  bus.stopAll();
  TEST_ASSERT_EQUAL(0, fake.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
  TEST_ASSERT_EQUAL(kGpioLevelLow, fake.lastDigitalLevel(pins::kPump1In1));
  TEST_ASSERT_EQUAL(kGpioLevelLow, fake.lastDigitalLevel(pins::kPump1In2));
  TEST_ASSERT_EQUAL(0, fake.lastAnalogDuty(pins::kPump1Pwm));
}

void test_stby_raised_once_and_dropped_after_last_stop() {
  FakeGpio fake;
  g_fake = &fake;
  MachineInputs inputs;
  PumpBus bus;
  bus.begin(inputs, makeOps());
  fake.reset();

  TEST_ASSERT_TRUE(bus.run(0, PumpDirection::kForward, 100));
  TEST_ASSERT_TRUE(bus.run(1, PumpDirection::kForward, 100));
  TEST_ASSERT_EQUAL(1, fake.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
  TEST_ASSERT_TRUE(fake.standby_high);

  bus.stop(0);
  TEST_ASSERT_EQUAL(0, fake.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelLow));
  TEST_ASSERT_TRUE(fake.standby_high);

  bus.stop(1);
  TEST_ASSERT_EQUAL(1, fake.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelLow));
  TEST_ASSERT_FALSE(fake.standby_high);
}

void test_direction_truth_table() {
  FakeGpio fake;
  g_fake = &fake;
  MachineInputs inputs;
  PumpBus bus;
  bus.begin(inputs, makeOps());
  fake.reset();

  TEST_ASSERT_TRUE(bus.run(0, PumpDirection::kForward, 100));
  TEST_ASSERT_EQUAL(kGpioLevelHigh, fake.lastDigitalLevel(pins::kPump1In1));
  TEST_ASSERT_EQUAL(kGpioLevelLow, fake.lastDigitalLevel(pins::kPump1In2));

  TEST_ASSERT_TRUE(bus.run(0, PumpDirection::kReverse, 100));
  TEST_ASSERT_EQUAL(kGpioLevelLow, fake.lastDigitalLevel(pins::kPump1In1));
  TEST_ASSERT_EQUAL(kGpioLevelHigh, fake.lastDigitalLevel(pins::kPump1In2));

  bus.stop(0);
  TEST_ASSERT_EQUAL(kGpioLevelLow, fake.lastDigitalLevel(pins::kPump1In1));
  TEST_ASSERT_EQUAL(kGpioLevelLow, fake.lastDigitalLevel(pins::kPump1In2));
}

void test_begin_drives_stby_low_before_any_channel_write() {
  FakeGpio fake;
  g_fake = &fake;
  MachineInputs inputs;
  PumpBus bus;

  bus.begin(inputs, makeOps());

  int first_stby_low = -1;
  int first_channel_write = -1;
  for (std::size_t i = 0; i < fake.writes.size(); ++i) {
    const WriteOp& op = fake.writes[i];
    if (first_stby_low < 0 && op.type == OpType::kDigitalWrite && op.pin == pins::kStandby &&
        op.value == kGpioLevelLow) {
      first_stby_low = static_cast<int>(i);
    }
    if (first_channel_write < 0 && isChannelPin(op.pin)) {
      first_channel_write = static_cast<int>(i);
    }
  }

  TEST_ASSERT_TRUE(first_stby_low >= 0);
  TEST_ASSERT_TRUE(first_channel_write >= 0);
  TEST_ASSERT_TRUE(first_stby_low < first_channel_write);
}

void test_duty_clamp_on_bus_run() {
  FakeGpio fake;
  g_fake = &fake;
  MachineInputs inputs;
  PumpBus bus;
  bus.begin(inputs, makeOps());
  fake.reset();

  TEST_ASSERT_TRUE(bus.run(0, PumpDirection::kForward, -20));
  TEST_ASSERT_EQUAL(0, fake.lastAnalogDuty(pins::kPump1Pwm));

  TEST_ASSERT_TRUE(bus.run(0, PumpDirection::kForward, 999));
  TEST_ASSERT_EQUAL(255, fake.lastAnalogDuty(pins::kPump1Pwm));
}

void test_stop_request_succeeds_even_when_cutoff_open() {
  FakeGpio fake;
  g_fake = &fake;
  MachineInputs inputs;
  PumpBus bus;
  bus.begin(inputs, makeOps());
  fake.reset();
  inputs.setCutoffOpen(true);

  TEST_ASSERT_TRUE(bus.run(0, PumpDirection::kStop, 100));
  TEST_ASSERT_EQUAL(0, fake.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
}

void test_pump_channel_clamps_duty() {
  FakeGpio fake;
  g_fake = &fake;
  PumpChannel channel;
  channel.begin(30, 31, 32, makeOps());
  fake.reset();

  channel.run(PumpDirection::kForward, -1);
  TEST_ASSERT_EQUAL(0, fake.lastAnalogDuty(32));

  channel.run(PumpDirection::kForward, 500);
  TEST_ASSERT_EQUAL(255, fake.lastAnalogDuty(32));
}

}  // namespace

void setUp() {
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_invalid_channel_returns_false_and_no_writes);
  RUN_TEST(test_run_before_begin_returns_false_and_no_writes);
  RUN_TEST(test_cutoff_open_fails_unsafe_when_inputs_unset);
  RUN_TEST(test_cutoff_open_refuses_motion_and_never_raises_stby);
  RUN_TEST(test_stby_raised_once_and_dropped_after_last_stop);
  RUN_TEST(test_direction_truth_table);
  RUN_TEST(test_begin_drives_stby_low_before_any_channel_write);
  RUN_TEST(test_duty_clamp_on_bus_run);
  RUN_TEST(test_stop_request_succeeds_even_when_cutoff_open);
  RUN_TEST(test_pump_channel_clamps_duty);
  return UNITY_END();
}
