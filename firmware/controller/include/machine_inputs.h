#pragma once

// Reads machine inputs once per ControlTask tick. Not a policy engine — it only
// reports state; subsystems decide what to do (distributed safety, docs/16).
class MachineInputs {
 public:
  void begin();
  void tick();  // future: read + debounce cutoff sense GPIO

  // Optional cutoff sense (rocker aux pole / VM divider). Stub returns closed
  // (safe) until pins::kCutoffSense is wired. Real GPIO must fail cutoff open on
  // disconnect/fault via active-low sense with pull-up.
  bool cutoffOpen() const {
    return cutoff_open_;
  }
  // Simulation hook for native tests of cutoff refusal behavior.
  void setCutoffOpen(bool open);

 private:
  bool cutoff_open_ = false;
};
