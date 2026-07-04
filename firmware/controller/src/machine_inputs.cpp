#include "machine_inputs.h"

#include "config.h"

void MachineInputs::begin() {
  // Stub: cutoff sense GPIO not wired yet. When pins::kCutoffSense >= 0, set up
  // the input (with pull-up) here so disconnected/faulted sense reads cutoff open.
  cutoff_open_ = false;
}

void MachineInputs::tick() {
  // Stub: no inputs to read yet. Future: debounce pins::kCutoffSense and set
  // cutoff_open_ accordingly (active-low + pull-up so broken wire fails open).
}

void MachineInputs::setCutoffOpen(bool open) {
  cutoff_open_ = open;
}
