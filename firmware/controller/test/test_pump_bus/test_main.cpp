#include <unity.h>

#include <cstddef>
#include <cstdint>
#include <vector>

#include "../support/fake_pump_io.h"
#include "config.h"
#include "pump_bus.h"
#include "pump_module.h"

namespace {

struct Rig {
  FakeGpio gpio;
  FakeI2c i2c;
  PumpBus bus;

  Rig() {
    g_gpio = &gpio;
    g_i2c = &i2c;
    g_io_log.clear();
  }
  void begin() {
    bus.begin(kFakeGpioOps, kFakeI2cOps);
  }
};

void test_invalid_channel_returns_false() {
  Rig r;
  r.begin();
  const std::size_t writes_after_begin = r.i2c.writes.size();

  TEST_ASSERT_FALSE(r.bus.run(42, PumpDirection::kForward));
  TEST_ASSERT_EQUAL_UINT(writes_after_begin, r.i2c.writes.size());
}

void test_run_before_begin_returns_false() {
  Rig r;

  TEST_ASSERT_FALSE(r.bus.run(0, PumpDirection::kForward));
  TEST_ASSERT_FALSE(r.gpio.standby_high);
}

void test_missing_module_refuses_run() {
  Rig r;
  r.i2c.present[0] = false;
  r.begin();

  TEST_ASSERT_FALSE(r.bus.modulePresent(0));
  TEST_ASSERT_FALSE(r.bus.channelPresent(0));
  TEST_ASSERT_FALSE(r.bus.faulted());
  TEST_ASSERT_FALSE(r.bus.run(0, PumpDirection::kForward));
  TEST_ASSERT_FALSE(r.gpio.standby_high);
}

void test_missing_channel_mask() {
  Rig r;
  r.i2c.present[2] = true;
  r.begin();

  // Modules 0 and 2 present → channels 4..7 and 12..15 missing.
  TEST_ASSERT_EQUAL_HEX16(0xF0F0, r.bus.missingChannelMask());
}

void test_set_driver_enabled_forces_stby_without_run() {
  Rig r;
  r.begin();
  r.gpio.reset();

  TEST_ASSERT_FALSE(r.bus.driverEnabled());
  TEST_ASSERT_TRUE(r.bus.setDriverEnabled(true));
  TEST_ASSERT_TRUE(r.bus.driverEnabled());
  TEST_ASSERT_TRUE(r.gpio.standby_high);
  TEST_ASSERT_EQUAL(1, r.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));

  TEST_ASSERT_TRUE(r.bus.setDriverEnabled(false));
  TEST_ASSERT_FALSE(r.bus.driverEnabled());
  TEST_ASSERT_FALSE(r.gpio.standby_high);
  TEST_ASSERT_EQUAL(1, r.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelLow));
}

void test_stby_raised_once_and_dropped_after_last_stop() {
  Rig r;
  r.begin();
  r.gpio.reset();

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));
  TEST_ASSERT_TRUE(r.bus.run(1, PumpDirection::kForward));
  TEST_ASSERT_EQUAL(1, r.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
  TEST_ASSERT_TRUE(r.gpio.standby_high);

  TEST_ASSERT_TRUE(r.bus.stop(0));
  TEST_ASSERT_EQUAL(0, r.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelLow));
  TEST_ASSERT_TRUE(r.gpio.standby_high);

  TEST_ASSERT_TRUE(r.bus.stop(1));
  TEST_ASSERT_EQUAL(1, r.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelLow));
  TEST_ASSERT_FALSE(r.gpio.standby_high);
}

void test_run_allows_concurrent_channels() {
  Rig r;
  r.begin();

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));
  TEST_ASSERT_TRUE(r.bus.run(1, PumpDirection::kForward));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(0));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(1));
  TEST_ASSERT_EQUAL_UINT(2, r.bus.runningCount());
}

void test_run_rejects_over_concurrent_cap() {
  Rig r;
  r.begin();
  r.bus.setMaxConcurrent(1);

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));
  TEST_ASSERT_FALSE(r.bus.run(1, PumpDirection::kForward));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(0));
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.channelBits(1));
  TEST_ASSERT_EQUAL_UINT(1, r.bus.runningCount());

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kReverse));
  TEST_ASSERT_EQUAL_UINT(reverseBits(), r.i2c.channelBits(0));
}

void test_direction_truth_table() {
  Rig r;
  r.begin();

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(0));

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kReverse));
  TEST_ASSERT_EQUAL_UINT(reverseBits(), r.i2c.channelBits(0));

  TEST_ASSERT_TRUE(r.bus.stop(0));
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.channelBits(0));
}

void test_pump_slot_maps_to_as_built_gpa_pair() {
  Rig r;
  r.begin();

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));  // pump 1
  const uint8_t pair = kModulePumpPair[0];
  TEST_ASSERT_EQUAL_HEX8(static_cast<uint8_t>(forwardBits() << (pair * 2)), r.i2c.olat[0]);
}

void test_per_channel_polarity() {
  Rig r;
  r.begin();
  const bool flipped = !kDefaultInvertMotorPolarity;

  TEST_ASSERT_TRUE(r.bus.setInvertPolarity(1, flipped));
  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));
  TEST_ASSERT_TRUE(r.bus.run(1, PumpDirection::kForward));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(0));
  TEST_ASSERT_EQUAL_UINT(forwardBits(flipped), r.i2c.channelBits(1));

  // Never flip a running pump (would reverse it mid-pour).
  TEST_ASSERT_FALSE(r.bus.setInvertPolarity(1, kDefaultInvertMotorPolarity));
  TEST_ASSERT_EQUAL_UINT(forwardBits(flipped), r.i2c.channelBits(1));
}

void test_begin_drives_stby_low_before_i2c() {
  Rig r;
  r.begin();

  int first_gpio_stby_low = -1;
  int seen_gpio = 0;
  for (std::size_t i = 0; i < r.gpio.writes.size(); ++i) {
    const WriteOp& op = r.gpio.writes[i];
    if (op.type == OpType::kDigitalWrite && op.pin == pins::kStandby && op.value == kGpioLevelLow) {
      first_gpio_stby_low = static_cast<int>(i);
      break;
    }
  }
  TEST_ASSERT_TRUE(first_gpio_stby_low >= 0);

  // Map that GPIO write into the shared log and require it precede every I2C write.
  int stby_low_log_index = -1;
  for (std::size_t i = 0; i < g_io_log.size(); ++i) {
    if (g_io_log[i] == IoKind::kGpio) {
      if (seen_gpio == first_gpio_stby_low) {
        stby_low_log_index = static_cast<int>(i);
        break;
      }
      ++seen_gpio;
    }
  }
  int first_i2c = -1;
  for (std::size_t i = 0; i < g_io_log.size(); ++i) {
    if (g_io_log[i] == IoKind::kI2c) {
      first_i2c = static_cast<int>(i);
      break;
    }
  }
  TEST_ASSERT_TRUE(stby_low_log_index >= 0);
  TEST_ASSERT_TRUE(first_i2c >= 0);
  TEST_ASSERT_TRUE(stby_low_log_index < first_i2c);
  TEST_ASSERT_TRUE(r.bus.modulePresent(0));
  TEST_ASSERT_EQUAL_UINT(0x00, r.i2c.iodir[0]);
  TEST_ASSERT_EQUAL_UINT(0x00, r.i2c.olat[0]);
}

void test_begin_clears_latch_before_enabling_outputs() {
  Rig r;
  // Warm reboot mid-pour: expander still powered with outputs on and run bits latched.
  r.i2c.iodir[0] = 0x00;
  r.i2c.olat[0] = 0x55;
  r.begin();

  TEST_ASSERT_TRUE(r.i2c.writes.size() >= 2);
  TEST_ASSERT_EQUAL_UINT(PumpModule::kRegOlatA, r.i2c.writes[0].reg);
  TEST_ASSERT_EQUAL_UINT(0x00, r.i2c.writes[0].value);
  TEST_ASSERT_EQUAL_UINT(PumpModule::kRegIodirA, r.i2c.writes[1].reg);
  TEST_ASSERT_EQUAL_UINT(0x00, r.i2c.writes[1].value);
}

void test_begin_olat_failure_faults_and_blocks_stby() {
  Rig r;
  r.i2c.present[1] = true;
  r.i2c.olat[0] = 0x55;  // stale run bits from before a warm reboot
  r.i2c.iodir[0] = 0x00;
  r.i2c.fail_remaining = 100;
  r.i2c.fail_addr = PumpBus::kBaseAddr;
  r.i2c.fail_reg = PumpModule::kRegOlatA;
  r.begin();

  TEST_ASSERT_FALSE(r.bus.modulePresent(0));
  TEST_ASSERT_TRUE(r.bus.faulted());
  // Acked module was released to inputs so the stale latch drives nothing.
  TEST_ASSERT_EQUAL_UINT(0xff, r.i2c.iodir[0]);
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.drivenBits(0));

  // A healthy second module must not raise the shared STBY.
  TEST_ASSERT_TRUE(r.bus.modulePresent(1));
  TEST_ASSERT_FALSE(r.bus.run(4, PumpDirection::kForward));
  TEST_ASSERT_FALSE(r.bus.setDriverEnabled(true));
  TEST_ASSERT_FALSE(r.gpio.standby_high);

  // Once the module parks cleanly, an idle rescan clears the fault.
  r.i2c.fail_remaining = 0;
  r.bus.rescan();
  TEST_ASSERT_FALSE(r.bus.faulted());
  TEST_ASSERT_TRUE(r.bus.modulePresent(0));
  TEST_ASSERT_TRUE(r.bus.run(4, PumpDirection::kForward));
}

void test_stop_write_failure_drops_stby() {
  Rig r;
  r.i2c.present[1] = true;
  r.begin();

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));  // 0x20
  TEST_ASSERT_TRUE(r.bus.run(4, PumpDirection::kForward));  // 0x21 keeps STBY wanted
  TEST_ASSERT_TRUE(r.gpio.standby_high);

  r.i2c.fail_remaining = PumpModule::kWriteAttempts;  // stop write + its retry NACK
  r.i2c.fail_addr = PumpBus::kBaseAddr;
  TEST_ASSERT_FALSE(r.bus.stop(0));

  // Pump 1's latch is still forward on the chip, so the whole bus must be stopped.
  TEST_ASSERT_FALSE(r.gpio.standby_high);
  TEST_ASSERT_FALSE(r.bus.anyRunning());
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.channelBits(4));
}

void test_stop_retries_single_nack() {
  Rig r;
  r.begin();
  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));

  r.i2c.fail_remaining = 1;
  TEST_ASSERT_TRUE(r.bus.stop(0));
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.channelBits(0));
  TEST_ASSERT_FALSE(r.bus.faulted());
}

void test_run_write_failure_leaves_no_phantom_pump() {
  Rig r;
  r.begin();
  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));

  r.i2c.fail_remaining = PumpModule::kWriteAttempts;
  TEST_ASSERT_FALSE(r.bus.run(1, PumpDirection::kForward));

  // Bus stopped; refused pump is not counted and its bits are not resent later.
  TEST_ASSERT_FALSE(r.gpio.standby_high);
  TEST_ASSERT_EQUAL_UINT(0, r.bus.runningCount());
  TEST_ASSERT_FALSE(r.bus.faulted());  // stopAll re-confirmed the latch

  TEST_ASSERT_TRUE(r.bus.run(2, PumpDirection::kForward));
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.channelBits(1));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(2));
  TEST_ASSERT_EQUAL_UINT(1, r.bus.runningCount());
}

void test_writes_reassert_outputs_after_expander_reset() {
  Rig r;
  r.begin();
  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));

  r.i2c.resetChip(0);  // brown-out: back to inputs, latch cleared
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.drivenBits(0));

  TEST_ASSERT_TRUE(r.bus.run(1, PumpDirection::kForward));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.drivenBits(0));
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.drivenBits(1));
}

void test_rescan_detects_hot_plugged_module() {
  Rig r;
  r.begin();
  TEST_ASSERT_FALSE(r.bus.modulePresent(1));

  r.i2c.present[1] = true;
  r.bus.rescan();
  TEST_ASSERT_TRUE(r.bus.modulePresent(1));
  TEST_ASSERT_EQUAL_UINT(0x00, r.i2c.iodir[1]);
  TEST_ASSERT_TRUE(r.bus.run(4, PumpDirection::kForward));
}

void test_rescan_skipped_while_running() {
  Rig r;
  r.begin();
  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kForward));
  const std::size_t writes_before = r.i2c.writes.size();

  r.bus.rescan();
  TEST_ASSERT_EQUAL_UINT(writes_before, r.i2c.writes.size());
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(0));
}

void test_second_module_address() {
  Rig r;
  r.i2c.present[1] = true;
  r.begin();

  TEST_ASSERT_TRUE(r.bus.modulePresent(1));
  TEST_ASSERT_TRUE(r.bus.run(4, PumpDirection::kForward));  // module B / 0x21
  TEST_ASSERT_EQUAL_UINT(forwardBits(), r.i2c.channelBits(4));
  TEST_ASSERT_EQUAL_UINT(0, r.i2c.channelBits(0));
}

void test_stop_request_succeeds() {
  Rig r;
  r.begin();
  r.gpio.reset();

  TEST_ASSERT_TRUE(r.bus.run(0, PumpDirection::kStop));
  TEST_ASSERT_EQUAL(0, r.gpio.count(OpType::kDigitalWrite, pins::kStandby, kGpioLevelHigh));
}

}  // namespace

void setUp() {
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_invalid_channel_returns_false);
  RUN_TEST(test_run_before_begin_returns_false);
  RUN_TEST(test_missing_module_refuses_run);
  RUN_TEST(test_missing_channel_mask);
  RUN_TEST(test_set_driver_enabled_forces_stby_without_run);
  RUN_TEST(test_stby_raised_once_and_dropped_after_last_stop);
  RUN_TEST(test_run_allows_concurrent_channels);
  RUN_TEST(test_run_rejects_over_concurrent_cap);
  RUN_TEST(test_direction_truth_table);
  RUN_TEST(test_pump_slot_maps_to_as_built_gpa_pair);
  RUN_TEST(test_per_channel_polarity);
  RUN_TEST(test_begin_drives_stby_low_before_i2c);
  RUN_TEST(test_begin_clears_latch_before_enabling_outputs);
  RUN_TEST(test_begin_olat_failure_faults_and_blocks_stby);
  RUN_TEST(test_stop_write_failure_drops_stby);
  RUN_TEST(test_stop_retries_single_nack);
  RUN_TEST(test_run_write_failure_leaves_no_phantom_pump);
  RUN_TEST(test_writes_reassert_outputs_after_expander_reset);
  RUN_TEST(test_rescan_detects_hot_plugged_module);
  RUN_TEST(test_rescan_skipped_while_running);
  RUN_TEST(test_second_module_address);
  RUN_TEST(test_stop_request_succeeds);
  return UNITY_END();
}
