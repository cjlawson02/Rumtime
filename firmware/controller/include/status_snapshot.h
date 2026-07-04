#pragma once

#include <cstdint>

// Post-dequeue / runtime job reject reason (uint8_t for serial printing).
enum class JobReject : uint8_t {
  kNone = 0,
  kBusy,
  kCutoffOpen,
  kBadChannel,
  kBadMl,
  kPourTooLong,
  kSubResolutionMl,
  kPumpRefused,
  kFlowTimeout,
  kScaleFault,
  kCutoffMidJob,
};

// Status snapshot (docs/16). Single writer (ControlTask), tear-free read for
// HTTP (seqlock / double-buffer) — publishing is still a plain copy placeholder.
struct StatusSnapshot {
  bool cutoff_open = false;
  bool pumps_running = false;
  bool scale_ready = false;
  float grams = 0.0f;  // filtered
  bool flow_detected = false;
  bool flow_timed_out = false;
  float last_delta_g = 0.0f;

  // Coordinator job status (subsystem 3). job_ok / job_error hold the result of
  // the last completed job; job_phase mirrors Coordinator::Phase (0 = idle).
  bool job_busy = false;
  bool job_ok = false;
  bool job_error = false;
  uint8_t job_phase = 0;
  JobReject job_reject = JobReject::kNone;
};

class StatusPublisher {
 public:
  void begin();
  // NOT tear-free yet (plain copy): do not call from another task until seqlock/double-buffer
  // lands.
  void publish(const StatusSnapshot& snapshot);
  // NOT tear-free yet (plain copy): do not call from another task until seqlock/double-buffer
  // lands.
  StatusSnapshot read() const;

 private:
  StatusSnapshot latest_;
};
