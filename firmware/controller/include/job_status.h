#pragma once

#include <cstdint>

#include "coordinator.h"
#include "status_snapshot.h"

// Inputs for published job status (ControlTask snapshot fields). Extracted for
// unit tests — priority: sequence in-progress > coordinator in-progress >
// sequence terminal > coordinator terminal.
struct JobStatusInputs {
  bool sequence_busy = false;
  Coordinator::JobResult sequence_result = Coordinator::JobResult::kNone;
  bool sequence_ok = false;
  bool sequence_error = false;
  bool sequence_cancelled = false;
  JobReject sequence_reject = JobReject::kNone;

  bool coordinator_busy = false;
  bool coordinator_ok = false;
  bool coordinator_error = false;
  bool coordinator_cancelled = false;
  JobReject coordinator_reject = JobReject::kNone;
  Coordinator::Phase coordinator_phase = Coordinator::Phase::kIdle;
};

inline void fillJobStatusFields(const JobStatusInputs& in, bool* job_ok, bool* job_error,
                                bool* job_cancelled, uint8_t* job_phase, JobReject* job_reject) {
  if (in.sequence_busy) {
    *job_ok = false;
    *job_error = false;
    *job_cancelled = false;
    *job_phase = static_cast<uint8_t>(in.coordinator_phase);
    *job_reject = JobReject::kNone;
    return;
  }
  if (in.coordinator_busy) {
    *job_ok = false;
    *job_error = false;
    *job_cancelled = false;
    *job_phase = static_cast<uint8_t>(in.coordinator_phase);
    *job_reject = in.coordinator_reject;
    return;
  }
  // Sequence terminal wins over a leftover coordinator result from the last step.
  if (in.sequence_result != Coordinator::JobResult::kNone) {
    *job_ok = in.sequence_ok;
    *job_error = in.sequence_error;
    *job_cancelled = in.sequence_cancelled;
    *job_phase = 0;
    *job_reject = in.sequence_reject;
    return;
  }
  if (in.coordinator_ok || in.coordinator_error || in.coordinator_cancelled) {
    *job_ok = in.coordinator_ok;
    *job_error = in.coordinator_error;
    *job_cancelled = in.coordinator_cancelled;
    *job_phase = 0;
    *job_reject = in.coordinator_reject;
    return;
  }
  *job_ok = false;
  *job_error = false;
  *job_cancelled = false;
  *job_phase = 0;
  *job_reject = JobReject::kNone;
}
