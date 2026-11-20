#include "pump_bus.h"

#include "config.h"

void PumpBus::begin(const GpioOps& gpio, const I2cOps& i2c) {
  initialized_ = false;
  driver_enabled_ = false;
  gpio_ = &gpio;
  i2c_ = &i2c;
  max_concurrent_ = kMaxConcurrentPumps;
  if (max_concurrent_ > kNumChannels) {
    max_concurrent_ = kNumChannels;
  }
  if (max_concurrent_ < 1) {
    max_concurrent_ = 1;
  }

  // Safe boot: STBY low before any expander can drive IN1/IN2.
  gpio_->pinMode(pins::kStandby, kGpioModeOutput);
  gpio_->digitalWrite(pins::kStandby, kGpioLevelLow);

  if (i2c.beginBus != nullptr) {
    i2c.beginBus(pins::kI2cSda, pins::kI2cScl);
  }

  for (uint8_t i = 0; i < kModulesMax; ++i) {
    modules_[i].begin(static_cast<uint8_t>(kBaseAddr + i), i2c);
  }

  initialized_ = true;
}

void PumpBus::rescan() {
  if (!initialized_ || driver_enabled_ || anyRunning()) {
    return;
  }
  for (uint8_t i = 0; i < kModulesMax; ++i) {
    modules_[i].begin(static_cast<uint8_t>(kBaseAddr + i), *i2c_);
  }
}

void PumpBus::setMaxConcurrent(uint8_t max_concurrent) {
  if (max_concurrent < 1) {
    max_concurrent_ = 1;
  } else if (max_concurrent > kNumChannels) {
    max_concurrent_ = kNumChannels;
  } else {
    max_concurrent_ = max_concurrent;
  }
}

PumpModule* PumpBus::moduleForChannel(uint8_t channel) {
  if (channel >= kNumChannels) {
    return nullptr;
  }
  return &modules_[channel / PumpModule::kPumpsPerModule];
}

const PumpModule* PumpBus::moduleForChannel(uint8_t channel) const {
  if (channel >= kNumChannels) {
    return nullptr;
  }
  return &modules_[channel / PumpModule::kPumpsPerModule];
}

bool PumpBus::modulePresent(uint8_t module_index) const {
  if (module_index >= kModulesMax) {
    return false;
  }
  return modules_[module_index].present();
}

bool PumpBus::channelPresent(uint8_t channel) const {
  const PumpModule* module = moduleForChannel(channel);
  return module != nullptr && module->present();
}

uint16_t PumpBus::missingChannelMask() const {
  uint16_t mask = 0;
  for (uint8_t ch = 0; ch < kNumChannels; ++ch) {
    if (!channelPresent(ch)) {
      mask = static_cast<uint16_t>(mask | (1u << ch));
    }
  }
  return mask;
}

bool PumpBus::faulted() const {
  for (uint8_t i = 0; i < kModulesMax; ++i) {
    if (modules_[i].faulted()) {
      return true;
    }
  }
  return false;
}

bool PumpBus::run(uint8_t channel, PumpDirection direction) {
  if (channel >= kNumChannels) {
    return false;
  }
  if (!initialized_) {
    return false;
  }
  PumpModule* module = moduleForChannel(channel);
  if (module == nullptr || !module->present()) {
    return false;
  }
  if (direction == PumpDirection::kStop) {
    return stop(channel);
  }
  if (faulted()) {
    return false;
  }
  const uint8_t local = localChannel(channel);
  const bool already_running = module->direction(local) != PumpDirection::kStop;
  if (!already_running && runningCount() >= max_concurrent_) {
    return false;
  }
  if (!module->run(local, direction) || !enableDriver()) {
    stopAll();
    return false;
  }
  return true;
}

bool PumpBus::stop(uint8_t channel) {
  if (!initialized_ || channel >= kNumChannels) {
    return false;
  }
  PumpModule* module = moduleForChannel(channel);
  if (module == nullptr || !module->present()) {
    return true;
  }
  if (!module->stop(localChannel(channel))) {
    // Latch may still drive this pump; STBY low is the only stop left.
    stopAll();
    return false;
  }
  if (!anyRunning()) {
    disableDriver();
  }
  return true;
}

void PumpBus::stopAll() {
  if (!initialized_) {
    return;
  }
  for (uint8_t i = 0; i < kModulesMax; ++i) {
    modules_[i].stopAll();
  }
  disableDriver();
}

bool PumpBus::anyRunning() const {
  return runningCount() > 0;
}

uint8_t PumpBus::runningCount() const {
  uint8_t count = 0;
  for (uint8_t ch = 0; ch < kNumChannels; ++ch) {
    const PumpModule* module = moduleForChannel(ch);
    if (module == nullptr || !module->present()) {
      continue;
    }
    if (module->direction(localChannel(ch)) != PumpDirection::kStop) {
      ++count;
    }
  }
  return count;
}

bool PumpBus::setInvertPolarity(uint8_t channel, bool invert) {
  PumpModule* module = moduleForChannel(channel);
  if (module == nullptr) {
    return false;
  }
  return module->setInvertPolarity(localChannel(channel), invert);
}

bool PumpBus::setDriverEnabled(bool enabled) {
  if (enabled) {
    return enableDriver();
  }
  disableDriver();
  return true;
}

bool PumpBus::enableDriver() {
  if (!initialized_ || gpio_ == nullptr || faulted()) {
    return false;
  }
  if (driver_enabled_) {
    return true;
  }
  gpio_->digitalWrite(pins::kStandby, kGpioLevelHigh);
  driver_enabled_ = true;
  return true;
}

void PumpBus::disableDriver() {
  if (!initialized_ || gpio_ == nullptr || !driver_enabled_) {
    return;
  }
  gpio_->digitalWrite(pins::kStandby, kGpioLevelLow);
  driver_enabled_ = false;
}
