#pragma once

#include <cstdint>

constexpr uint8_t kGpioModeOutput = 1;
constexpr uint8_t kGpioLevelLow = 0;
constexpr uint8_t kGpioLevelHigh = 1;

struct GpioOps {
  void (*pinMode)(int pin, uint8_t mode);
  void (*digitalWrite)(int pin, uint8_t level);
  void (*analogWrite)(int pin, int duty);
};
