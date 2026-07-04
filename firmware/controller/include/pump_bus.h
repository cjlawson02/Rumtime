#pragma once

#include <cstdint>

#include "config.h"
#include "gpio_ops.h"
#include "machine_inputs.h"
#include "pump_channel.h"

// Owns the shared TB6612 STBY line and both PumpChannels. Sole motor output path.
// Distributed safety: refuses run() and forces stopAll() when the cutoff is open.
class PumpBus {
 public:
  static constexpr uint8_t kNumChannels = 2;

  // Safe boot: STBY low, IN1/IN2 low before the driver is enabled.
  void begin(MachineInputs& inputs, const GpioOps& gpio);

  // Returns false (and stops all) if channel invalid or cutoff open.
  bool run(uint8_t channel, PumpDirection direction, int duty = kPumpPwmFull);
  void stop(uint8_t channel);
  void stopAll();

  // Called each ControlTask tick: stopAll() if cutoff is open.
  void tick();

  bool cutoffOpen() const;
  bool anyRunning() const;

 private:
  void enableDriver();   // STBY high
  void disableDriver();  // STBY low

  MachineInputs* inputs_ = nullptr;
  const GpioOps* gpio_ = nullptr;
  // Invariant: channels_ stays private; no raw channel accessor is allowed.
  PumpChannel channels_[kNumChannels];
  bool initialized_ = false;
  bool driver_enabled_ = false;
};
