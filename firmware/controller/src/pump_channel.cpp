#include "pump_channel.h"

namespace {

int clampDuty(int duty) {
  if (duty < 0) {
    return 0;
  }
  if (duty > 255) {
    return 255;
  }
  return duty;
}

}  // namespace

void PumpChannel::begin(int in1, int in2, int pwm, const GpioOps& gpio) {
  in1_ = in1;
  in2_ = in2;
  pwm_pin_ = pwm;
  gpio_ = &gpio;
  gpio_->pinMode(in1_, kGpioModeOutput);
  gpio_->pinMode(in2_, kGpioModeOutput);
  gpio_->pinMode(pwm_pin_, kGpioModeOutput);
  // Safe defaults before the driver is enabled: direction stopped, PWM off.
  applyDirection(PumpDirection::kStop);
  pwm_duty_ = 0;
  gpio_->analogWrite(pwm_pin_, 0);
}

void PumpChannel::run(PumpDirection direction, int duty) {
  if (direction == PumpDirection::kStop) {
    stop();
    return;
  }
  const int clamped_duty = clampDuty(duty);
  pwm_duty_ = clamped_duty;
  applyDirection(direction);
  gpio_->analogWrite(pwm_pin_, clamped_duty);
}

void PumpChannel::stop() {
  applyDirection(PumpDirection::kStop);
  pwm_duty_ = 0;
  gpio_->analogWrite(pwm_pin_, 0);
}

void PumpChannel::applyDirection(PumpDirection direction) {
  direction_ = direction;
  switch (direction) {
    case PumpDirection::kForward:
      gpio_->digitalWrite(in1_, kGpioLevelHigh);
      gpio_->digitalWrite(in2_, kGpioLevelLow);
      break;
    case PumpDirection::kReverse:
      gpio_->digitalWrite(in1_, kGpioLevelLow);
      gpio_->digitalWrite(in2_, kGpioLevelHigh);
      break;
    case PumpDirection::kStop:
    default:
      gpio_->digitalWrite(in1_, kGpioLevelLow);
      gpio_->digitalWrite(in2_, kGpioLevelLow);
      break;
  }
}
