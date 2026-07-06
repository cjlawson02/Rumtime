#include "pump_bus.h"

#include "config.h"

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

void PumpBus::begin(const GpioOps& gpio) {
  initialized_ = false;
  driver_enabled_ = false;
  gpio_ = &gpio;

  // Safe boot ordering: STBY low first so channel writes cannot drive motors,
  // then park each channel with IN1/IN2 low and PWM off.
  gpio_->pinMode(pins::kStandby, kGpioModeOutput);
  gpio_->digitalWrite(pins::kStandby, kGpioLevelLow);

  channels_[0].begin(pins::kPump1In1, pins::kPump1In2, pins::kPump1Pwm, gpio);
  channels_[1].begin(pins::kPump2In1, pins::kPump2In2, pins::kPump2Pwm, gpio);
  initialized_ = true;
}

bool PumpBus::run(uint8_t channel, PumpDirection direction, int duty) {
  if (channel >= kNumChannels) {
    return false;
  }
  if (!initialized_) {
    return false;
  }
  if (direction == PumpDirection::kStop) {
    stop(channel);
    return true;
  }
  for (uint8_t i = 0; i < kNumChannels; ++i) {
    if (i != channel && channels_[i].direction() != PumpDirection::kStop) {
      channels_[i].stop();
    }
  }
  channels_[channel].run(direction, clampDuty(duty));
  enableDriver();
  return true;
}

void PumpBus::stop(uint8_t channel) {
  if (!initialized_ || channel >= kNumChannels) {
    return;
  }
  channels_[channel].stop();
  if (!anyRunning()) {
    disableDriver();
  }
}

void PumpBus::stopAll() {
  if (!initialized_) {
    return;
  }
  for (uint8_t i = 0; i < kNumChannels; ++i) {
    channels_[i].stop();
  }
  disableDriver();
}

bool PumpBus::anyRunning() const {
  for (uint8_t i = 0; i < kNumChannels; ++i) {
    if (channels_[i].direction() != PumpDirection::kStop) {
      return true;
    }
  }
  return false;
}

void PumpBus::enableDriver() {
  if (!initialized_ || gpio_ == nullptr || driver_enabled_) {
    return;
  }
  gpio_->digitalWrite(pins::kStandby, kGpioLevelHigh);
  driver_enabled_ = true;
}

void PumpBus::disableDriver() {
  if (!initialized_ || gpio_ == nullptr || !driver_enabled_) {
    return;
  }
  gpio_->digitalWrite(pins::kStandby, kGpioLevelLow);
  driver_enabled_ = false;
}
