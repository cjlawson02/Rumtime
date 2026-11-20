#pragma once

#include <cstdint>

#include "config.h"
#include "gpio_ops.h"
#include "i2c_ops.h"
#include "pump_direction.h"
#include "pump_module.h"

// Owns PUMP_BUS_ENABLE (STBY) and up to four MCP23017 pump modules.
// Sole motor output path for the motherboard (I2C; PWM strapped high on modules).
//
// Invariant: any failed expander write ends in stopAll() (STBY low), and STBY is
// never raised while a module is faulted (latch state unknown).
class PumpBus {
 public:
  static constexpr uint8_t kModulesMax = 4;
  static constexpr uint8_t kNumChannels =
      static_cast<uint8_t>(kModulesMax * PumpModule::kPumpsPerModule);
  static constexpr uint8_t kBaseAddr = 0x20;

  // Safe boot: STBY low, probe 0x20–0x23, park present modules stopped.
  // Keeps pointers to gpio and i2c, so both must outlive the bus.
  void begin(const GpioOps& gpio, const I2cOps& i2c);
  void begin(GpioOps&& gpio, const I2cOps& i2c) = delete;
  void begin(const GpioOps& gpio, I2cOps&& i2c) = delete;
  void begin(GpioOps&& gpio, I2cOps&& i2c) = delete;

  // Re-probe every module while idle (nothing running, STBY low): picks up a
  // module plugged in after boot, re-arms one that reset, and clears faults
  // once the expander parks cleanly. No-op while any channel runs.
  void rescan();

  // Returns false if channel invalid, bus not initialized, module missing, any
  // module faulted, starting this channel would exceed maxConcurrent()
  // (already-running may retune), or the expander write failed (bus stopped).
  bool run(uint8_t channel, PumpDirection direction);
  // Returns false when the stop could not be written; the whole bus is then
  // stopped (STBY low) so the channel cannot keep running.
  bool stop(uint8_t channel);
  void stopAll();

  bool anyRunning() const;
  uint8_t runningCount() const;
  bool modulePresent(uint8_t module_index) const;
  bool channelPresent(uint8_t channel) const;
  // Bit ch set when the module for channel ch was not detected.
  uint16_t missingChannelMask() const;
  bool faulted() const;

  // Per-pump IN1/IN2 swap (ConfigStore pump polarity). Refused while that channel runs.
  bool setInvertPolarity(uint8_t channel, bool invert);

  uint8_t maxConcurrent() const {
    return max_concurrent_;
  }
  // Test / bring-up override; clamped to [1, kNumChannels].
  void setMaxConcurrent(uint8_t max_concurrent);

  // Motherboard bring-up: force PUMP_BUS_ENABLE (STBY) without a running channel.
  // Returns false when enabling is refused (not initialized or a module is faulted).
  bool setDriverEnabled(bool enabled);
  bool driverEnabled() const {
    return driver_enabled_;
  }

 private:
  bool enableDriver();   // STBY high; refused while faulted
  void disableDriver();  // STBY low
  PumpModule* moduleForChannel(uint8_t channel);
  const PumpModule* moduleForChannel(uint8_t channel) const;
  static uint8_t localChannel(uint8_t channel) {
    return static_cast<uint8_t>(channel % PumpModule::kPumpsPerModule);
  }

  const GpioOps* gpio_ = nullptr;
  const I2cOps* i2c_ = nullptr;
  PumpModule modules_[kModulesMax];
  bool initialized_ = false;
  bool driver_enabled_ = false;
  uint8_t max_concurrent_ = kMaxConcurrentPumps;
};
