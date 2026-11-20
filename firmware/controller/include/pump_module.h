#pragma once

#include <cstdint>

#include "config.h"
#include "i2c_ops.h"
#include "pump_direction.h"

// One 4-pump cartridge: MCP23017 GPA0..7 = four IN1/IN2 pairs; logical pump slot
// → pair via kModulePumpPair (as-built order, config.h).
// PWM is strapped high on the PCB; STBY is shared on the ESP32.
class PumpModule {
 public:
  static constexpr uint8_t kPumpsPerModule = 4;
  static constexpr uint8_t kRegIodirA = 0x00;
  static constexpr uint8_t kRegOlatA = 0x14;
  // Each register write is retried once (motor noise can NACK a single transfer).
  static constexpr uint8_t kWriteAttempts = 2;

  // Park stopped: OLATA = 0 first (a warm reboot can leave old pump bits latched),
  // then IODIRA = all outputs. present() is false unless both writes succeed.
  // faulted() is set when the expander acknowledged but could not be fully parked
  // (PumpBus then refuses STBY until a later begin() succeeds). Safe to call
  // again while idle to re-detect a reset or hot-plugged module.
  void begin(uint8_t addr7, const I2cOps& i2c);
  void begin(uint8_t addr7, I2cOps&& i2c) = delete;  // stores a pointer to i2c

  bool present() const {
    return present_;
  }
  // Output latch may hold run bits the firmware does not know about.
  bool faulted() const {
    return faulted_;
  }
  uint8_t addr() const {
    return addr_;
  }

  // local_channel is 0..3 within this module. On a failed write run() leaves the
  // cached latch unchanged, marks the module faulted, and returns false.
  bool run(uint8_t local_channel, PumpDirection direction);
  // Always records the channel as stopped; returns false (and marks the module
  // faulted) when the stop could not be written to the expander.
  bool stop(uint8_t local_channel);
  bool stopAll();

  // Per-pump IN1/IN2 swap for as-built lead polarity. Refused while the channel runs.
  bool setInvertPolarity(uint8_t local_channel, bool invert);
  bool invertPolarity(uint8_t local_channel) const;

  PumpDirection direction(uint8_t local_channel) const;
  uint8_t olat() const {
    return olat_;
  }

 private:
  bool writeReg(uint8_t reg, uint8_t value);
  // OLATA then IODIRA, so an expander that reset (IODIR back to inputs) is
  // re-armed with the intended latch on the next write.
  bool writeOutputs(uint8_t olat);
  uint8_t latchWith(uint8_t local_channel, PumpDirection direction) const;

  const I2cOps* i2c_ = nullptr;
  uint8_t addr_ = 0;
  uint8_t olat_ = 0;
  bool present_ = false;
  bool faulted_ = false;
  PumpDirection directions_[kPumpsPerModule] = {};
  bool invert_[kPumpsPerModule] = {kDefaultInvertMotorPolarity, kDefaultInvertMotorPolarity,
                                   kDefaultInvertMotorPolarity, kDefaultInvertMotorPolarity};
};
