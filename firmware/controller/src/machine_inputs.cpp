#include "machine_inputs.h"

#include "config.h"

#if defined(ARDUINO)
#include <Arduino.h>
#endif

namespace {

constexpr uint8_t kCutoffDebounceReads = 3;

}  // namespace

void MachineInputs::begin() {
  cutoff_open_ = false;
  sense_wired_ = false;
  debounce_count_ = 0;
  debounced_open_ = false;

  if (pins::kCutoffSense < 0) {
    return;
  }

#if defined(ARDUINO)
  pinMode(pins::kCutoffSense, INPUT_PULLUP);
  sense_wired_ = true;
  // Fail open until debounce settles (broken wire reads HIGH via pull-up).
  cutoff_open_ = true;
  debounced_open_ = true;
#endif
}

void MachineInputs::tick() {
  if (!sense_wired_) {
    return;
  }

#if defined(ARDUINO)
  // Active-low sense: LOW = cutoff closed, HIGH = open / broken wire.
  const bool sample_open = digitalRead(pins::kCutoffSense) == HIGH;
  if (sample_open == debounced_open_) {
    debounce_count_ = 0;
  } else if (debounce_count_ + 1 >= kCutoffDebounceReads) {
    debounced_open_ = sample_open;
    debounce_count_ = 0;
  } else {
    ++debounce_count_;
  }
  cutoff_open_ = debounced_open_;
#endif
}

void MachineInputs::setCutoffOpen(bool open) {
  cutoff_open_ = open;
  debounced_open_ = open;
  debounce_count_ = 0;
}
