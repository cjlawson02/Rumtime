#pragma once

#include <cstdint>

// Reads machine inputs once per ControlTask tick. Not a policy engine — it only
// reports state; subsystems decide what to do (distributed safety, docs/16).
class MachineInputs {
 public:
  void begin();
  void tick();  // future: read + debounce cutoff sense GPIO

  // Optional GPIO tap of the same VM rocker (not a second switch). v1 bench leaves
  // pins::kCutoffSense at -1 — hardware rocker only; software reports cutoff closed.
  bool cutoffOpen() const {
    return cutoff_open_;
  }
  // Simulation hook for native tests of cutoff refusal behavior.
  void setCutoffOpen(bool open);

 private:
  bool cutoff_open_ = false;
  bool sense_wired_ = false;
  bool debounced_open_ = false;
  uint8_t debounce_count_ = 0;
};
