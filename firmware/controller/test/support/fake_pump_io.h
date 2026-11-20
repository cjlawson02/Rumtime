#pragma once

// Shared host fakes for PumpBus suites: GPIO (STBY) + MCP23017 I2C modules.
// Header-only; each test binary is a single TU, so everything is TU-local.
// Include as "../support/fake_pump_io.h" from test/test_*/test_main.cpp.

#include <cstddef>
#include <cstdint>
#include <vector>

#include "config.h"
#include "gpio_ops.h"
#include "i2c_ops.h"
#include "pump_bus.h"
#include "pump_module.h"

namespace {

enum class OpType { kPinMode, kDigitalWrite };

struct WriteOp {
  OpType type;
  int pin;
  int value;
};

struct I2cWrite {
  uint8_t addr;
  uint8_t reg;
  uint8_t value;
};

// One sequence across both fakes so tests can assert GPIO vs I2C ordering.
enum class IoKind { kGpio, kI2c };
std::vector<IoKind> g_io_log;

class FakeGpio {
 public:
  void reset() {
    writes.clear();
    standby_high = false;
  }
  void pinMode(int pin, uint8_t mode) {
    writes.push_back({OpType::kPinMode, pin, mode});
    g_io_log.push_back(IoKind::kGpio);
  }
  void digitalWrite(int pin, uint8_t level) {
    writes.push_back({OpType::kDigitalWrite, pin, level});
    g_io_log.push_back(IoKind::kGpio);
    if (pin == pins::kStandby) {
      standby_high = (level == kGpioLevelHigh);
    }
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

// MCP23017 at 0x20..0x23. Tracks OLATA + IODIRA per chip. fail_remaining > 0
// NACKs that many upcoming writes (optionally only to fail_addr / fail_reg)
// without applying them; PumpModule retries each write kWriteAttempts times.
class FakeI2c {
 public:
  static constexpr uint8_t kChips = 4;

  void reset() {
    writes.clear();
    olat_history.clear();
    for (uint8_t i = 0; i < kChips; ++i) {
      olat[i] = 0;
      iodir[i] = 0xff;
    }
    fail_remaining = 0;
    fail_addr = -1;
    fail_reg = -1;
  }
  // Power-on reset of one expander (IODIR back to inputs, latch cleared).
  void resetChip(uint8_t idx) {
    olat[idx] = 0;
    iodir[idx] = 0xff;
  }
  void beginBus(int, int) {
  }
  bool writeReg(uint8_t addr7, uint8_t reg, uint8_t value) {
    g_io_log.push_back(IoKind::kI2c);
    if (addr7 < PumpBus::kBaseAddr || addr7 >= PumpBus::kBaseAddr + kChips) {
      return false;
    }
    const uint8_t idx = static_cast<uint8_t>(addr7 - PumpBus::kBaseAddr);
    if (!present[idx]) {
      return false;
    }
    if (fail_remaining > 0 && (fail_addr < 0 || fail_addr == addr7) &&
        (fail_reg < 0 || fail_reg == reg)) {
      --fail_remaining;
      ++failed_writes;
      return false;
    }
    writes.push_back({addr7, reg, value});
    if (reg == PumpModule::kRegIodirA) {
      iodir[idx] = value;
    } else if (reg == PumpModule::kRegOlatA) {
      olat[idx] = value;
      olat_history.push_back(value);
    }
    return true;
  }
  // Logical pump channel → its GPA pair bits (through kModulePumpPair).
  uint8_t channelBits(uint8_t channel) const {
    const uint8_t idx = static_cast<uint8_t>(channel / PumpModule::kPumpsPerModule);
    return static_cast<uint8_t>((olat[idx] >> (pairOf(channel) * 2)) & 0x3);
  }
  // Bits actually driven onto IN1/IN2 (inputs drive nothing).
  uint8_t drivenBits(uint8_t channel) const {
    const uint8_t idx = static_cast<uint8_t>(channel / PumpModule::kPumpsPerModule);
    return static_cast<uint8_t>(((olat[idx] & ~iodir[idx]) >> (pairOf(channel) * 2)) & 0x3);
  }
  static uint8_t pairOf(uint8_t channel) {
    return kModulePumpPair[channel % PumpModule::kPumpsPerModule];
  }

  bool present[kChips] = {true, false, false, false};
  uint8_t olat[kChips] = {};
  uint8_t iodir[kChips] = {0xff, 0xff, 0xff, 0xff};
  int fail_remaining = 0;
  int fail_addr = -1;
  int fail_reg = -1;
  int failed_writes = 0;
  std::vector<I2cWrite> writes;
  std::vector<uint8_t> olat_history;
};

FakeGpio* g_gpio = nullptr;
FakeI2c* g_i2c = nullptr;

void fakePinMode(int pin, uint8_t mode) {
  g_gpio->pinMode(pin, mode);
}
void fakeDigitalWrite(int pin, uint8_t level) {
  g_gpio->digitalWrite(pin, level);
}
void fakeI2cBeginBus(int sda, int scl) {
  g_i2c->beginBus(sda, scl);
}
bool fakeI2cWriteReg(uint8_t addr, uint8_t reg, uint8_t value) {
  return g_i2c->writeReg(addr, reg, value);
}

// PumpBus keeps pointers to its ops: always pass these named constants.
const GpioOps kFakeGpioOps = {fakePinMode, fakeDigitalWrite};
const I2cOps kFakeI2cOps = {fakeI2cBeginBus, fakeI2cWriteReg};

// Channel IN1/IN2 bits for pump direction under the seed polarity.
uint8_t forwardBits(bool invert = kDefaultInvertMotorPolarity) {
  return invert ? 0x2 : 0x1;
}
uint8_t reverseBits(bool invert = kDefaultInvertMotorPolarity) {
  return invert ? 0x1 : 0x2;
}

}  // namespace
