#pragma once

#include <cstdint>

#include "config.h"
#include "gpio_ops.h"
#include "pump_channel.h"

// Owns the shared TB6612 STBY line and both PumpChannels. Sole motor output path.
class PumpBus {
 public:
  static constexpr uint8_t kNumChannels = 2;

  // Safe boot: STBY low, IN1/IN2 low before the driver is enabled.
  void begin(const GpioOps& gpio);

  // Returns false if channel invalid, bus not initialized, or starting this
  // channel would exceed maxConcurrent() (already-running channel may retune).
  bool run(uint8_t channel, PumpDirection direction, int duty = kPumpPwmFull);
  void stop(uint8_t channel);
  void stopAll();

  bool anyRunning() const;
  uint8_t runningCount() const;

  uint8_t maxConcurrent() const {
    return max_concurrent_;
  }
  // Test / bring-up override; clamped to [1, kNumChannels].
  void setMaxConcurrent(uint8_t max_concurrent);

 private:
  void enableDriver();   // STBY high
  void disableDriver();  // STBY low

  const GpioOps* gpio_ = nullptr;
  // Invariant: channels_ stays private; no raw channel accessor is allowed.
  PumpChannel channels_[kNumChannels];
  bool initialized_ = false;
  bool driver_enabled_ = false;
  uint8_t max_concurrent_ = kMaxConcurrentPumps;
};
