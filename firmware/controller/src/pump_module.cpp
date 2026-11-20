#include "pump_module.h"

namespace {

// pair = GPA IN1/IN2 pair index (kModulePumpPair), not the logical pump slot.
uint8_t directionMask(uint8_t pair, PumpDirection direction, bool invert) {
  const uint8_t in1_bit = static_cast<uint8_t>(pair * 2);
  const uint8_t in2_bit = static_cast<uint8_t>(in1_bit + 1);
  const bool forward_in1_high = !invert;

  uint8_t mask = 0;
  switch (direction) {
    case PumpDirection::kForward:
      if (forward_in1_high) {
        mask = static_cast<uint8_t>(1u << in1_bit);
      } else {
        mask = static_cast<uint8_t>(1u << in2_bit);
      }
      break;
    case PumpDirection::kReverse:
      if (forward_in1_high) {
        mask = static_cast<uint8_t>(1u << in2_bit);
      } else {
        mask = static_cast<uint8_t>(1u << in1_bit);
      }
      break;
    case PumpDirection::kStop:
    default:
      mask = 0;
      break;
  }
  return mask;
}

uint8_t channelClearMask(uint8_t pair) {
  const uint8_t in1_bit = static_cast<uint8_t>(pair * 2);
  return static_cast<uint8_t>(~(uint8_t{3} << in1_bit));
}

}  // namespace

void PumpModule::begin(uint8_t addr7, const I2cOps& i2c) {
  i2c_ = &i2c;
  addr_ = addr7;
  olat_ = 0;
  present_ = false;
  faulted_ = false;
  for (uint8_t i = 0; i < kPumpsPerModule; ++i) {
    directions_[i] = PumpDirection::kStop;
  }
  if (i2c_->writeReg == nullptr) {
    return;
  }
  // Clear the latch before (re)asserting outputs so stale run bits never drive IN1/IN2.
  if (writeReg(kRegOlatA, 0x00)) {
    if (writeReg(kRegIodirA, 0x00)) {
      present_ = true;
    } else {
      faulted_ = true;
    }
    return;
  }
  // No ack on OLATA: either no module here, or a flaky one with an unknown latch.
  // IODIRA = 0xFF (reset default, all inputs) releases any driven pins if it is there.
  if (writeReg(kRegIodirA, 0xFF)) {
    faulted_ = true;
  }
}

bool PumpModule::writeReg(uint8_t reg, uint8_t value) {
  for (uint8_t attempt = 0; attempt < kWriteAttempts; ++attempt) {
    if (i2c_->writeReg(addr_, reg, value)) {
      return true;
    }
  }
  return false;
}

bool PumpModule::writeOutputs(uint8_t olat) {
  if (!present_ || i2c_ == nullptr || i2c_->writeReg == nullptr) {
    return false;
  }
  return writeReg(kRegOlatA, olat) && writeReg(kRegIodirA, 0x00);
}

uint8_t PumpModule::latchWith(uint8_t local_channel, PumpDirection direction) const {
  const uint8_t pair = kModulePumpPair[local_channel];
  return static_cast<uint8_t>((olat_ & channelClearMask(pair)) |
                              directionMask(pair, direction, invert_[local_channel]));
}

bool PumpModule::run(uint8_t local_channel, PumpDirection direction) {
  if (!present_ || local_channel >= kPumpsPerModule) {
    return false;
  }
  if (direction == PumpDirection::kStop) {
    return stop(local_channel);
  }
  const uint8_t next = latchWith(local_channel, direction);
  if (!writeOutputs(next)) {
    faulted_ = true;
    return false;
  }
  olat_ = next;
  directions_[local_channel] = direction;
  return true;
}

bool PumpModule::stop(uint8_t local_channel) {
  if (!present_ || local_channel >= kPumpsPerModule) {
    return true;  // nothing this module can be driving
  }
  olat_ = latchWith(local_channel, PumpDirection::kStop);
  directions_[local_channel] = PumpDirection::kStop;
  if (!writeOutputs(olat_)) {
    faulted_ = true;
    return false;
  }
  return true;
}

bool PumpModule::stopAll() {
  if (!present_) {
    return true;
  }
  olat_ = 0;
  for (uint8_t i = 0; i < kPumpsPerModule; ++i) {
    directions_[i] = PumpDirection::kStop;
  }
  if (!writeOutputs(olat_)) {
    faulted_ = true;
    return false;
  }
  faulted_ = false;  // latch confirmed all-stopped
  return true;
}

bool PumpModule::setInvertPolarity(uint8_t local_channel, bool invert) {
  if (local_channel >= kPumpsPerModule || directions_[local_channel] != PumpDirection::kStop) {
    return false;
  }
  invert_[local_channel] = invert;
  return true;
}

bool PumpModule::invertPolarity(uint8_t local_channel) const {
  if (local_channel >= kPumpsPerModule) {
    return kDefaultInvertMotorPolarity;
  }
  return invert_[local_channel];
}

PumpDirection PumpModule::direction(uint8_t local_channel) const {
  if (local_channel >= kPumpsPerModule) {
    return PumpDirection::kStop;
  }
  return directions_[local_channel];
}
