#pragma once

#include <cstdint>

#include "gpio_ops.h"

enum class PumpDirection : uint8_t { kStop, kForward, kReverse };

// One TB6612 channel (IN1/IN2/PWM). Sole GPIO writer for its motor outputs.
// STBY is shared and owned by PumpBus, not here.
class PumpChannel {
 public:
  void begin(int in1, int in2, int pwm, const GpioOps& gpio);

  void run(PumpDirection direction, int duty);  // duty 0–255
  void stop();

  PumpDirection direction() const {
    return direction_;
  }
  int pwm() const {
    return pwm_duty_;
  }

 private:
  void applyDirection(PumpDirection direction);

  int in1_ = -1;
  int in2_ = -1;
  int pwm_pin_ = -1;
  const GpioOps* gpio_ = nullptr;
  int pwm_duty_ = 0;
  PumpDirection direction_ = PumpDirection::kStop;
};
