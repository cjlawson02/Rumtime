#pragma once

#include <cstdint>

#include "command_queue.h"
#include "config.h"
#include "status_snapshot.h"

class PumpBus;
class ScalePlatform;
class ConfigStore;

// Activity coordinator (docs/16 Layer 2). At most one job at a time; drives a
// single-pump gated timed dispense as a non-blocking sub-FSM advanced in tick().
// Uses PumpBus + ScalePlatform only — never touches GPIO directly.
//
// v1 scope: one pump at a time; multi-step recipes run via SequenceRunner.
// Parallel pump groups are deferred (docs/16 phased implementation).
class Coordinator {
 public:
  enum class JobState : uint8_t { kIdle, kDispensing, kPriming };

  // Sub-FSM phases for a dispense job. Published as job_phase in the snapshot.
  enum class Phase : uint8_t {
    kIdle = 0,
    kFlowWait,  // pump forward, waiting for flow onset (gated)
    kPour,      // pump forward, timed pour running
    kAntiDrip,  // pump reverse, anti-drip purge
    kPrime,     // pump forward, continuous prime (no pour timer)
  };

  enum class JobResult : uint8_t { kNone, kOk, kError, kCancelled };

  void begin(PumpBus& pumps, ScalePlatform& scale, ConfigStore& config);

  // Start a single-pump dispense. Returns false (and does not start motion) when
  // busy, channel invalid, or ml <= 0. now_ms is the ControlTask clock (millis())
  // used for flow-gate and pour deadlines.
  bool startDispense(const DispenseCommand& command, unsigned long now_ms);

  // Start continuous forward prime on one pump. Returns false when busy or channel
  // invalid. No scale / flow gate. now_ms is the ControlTask clock.
  bool startPrime(uint8_t channel, unsigned long now_ms);

  // Operator stop during prime: pump off, job ok, no anti-drip. No-op when idle
  // or not in the prime phase.
  void stopPrime();

  // Cancel any in-flight job immediately: stopAll(), clear job, no success flag,
  // no anti-drip (documented default). Safe to call when idle.
  void cancel();

  // Advance the current job by one control period. Non-blocking.
  void tick(unsigned long now_ms);

  // Clear terminal result after status has been published (mirrors SequenceRunner).
  void clearTerminalResult();

  bool busy() const {
    return state_ != JobState::kIdle;
  }
  Phase phase() const {
    return phase_;
  }
  JobResult result() const {
    return result_;
  }
  bool ok() const {
    return result_ == JobResult::kOk;
  }
  bool error() const {
    return result_ == JobResult::kError;
  }
  bool cancelled() const {
    return result_ == JobResult::kCancelled;
  }
  JobReject lastReject() const {
    return last_reject_;
  }

  // 0–100 within the current dispense (flow-wait stays low; pour is timed; anti-drip → 100).
  uint8_t dispenseProgressPercent(unsigned long now_ms) const;

 private:
  void beginPour(unsigned long now_ms);  // enter timed pour from motor-on now
  void beginAntiDrip(unsigned long now_ms);
  void finish(JobResult result);  // stopAll(), return to idle

  PumpBus* pumps_ = nullptr;
  ScalePlatform* scale_ = nullptr;
  ConfigStore* config_ = nullptr;

  JobState state_ = JobState::kIdle;
  Phase phase_ = Phase::kIdle;
  JobResult result_ = JobResult::kNone;
  JobReject last_reject_ = JobReject::kNone;

  uint8_t channel_ = 0;
  unsigned long pour_ms_ = 0;  // computed pour duration for this job
  // Per-pump calibration captured at startDispense() from ConfigStore, so the job
  // is unaffected if config is edited mid-pour.
  unsigned long anti_drip_ms_ = static_cast<unsigned long>(kDefaultAntiDripMs);
  // Deadlines use elapsed-subtraction (now - start >= duration) so they are
  // millis() rollover-safe, matching ScalePlatform's flow-timeout idiom.
  unsigned long pour_start_ms_ = 0;
  unsigned long anti_drip_start_ms_ = 0;
  unsigned long prime_start_ms_ = 0;
  unsigned long flow_wait_start_ms_ = 0;
  unsigned long flow_wait_max_ms_ = 0;
  bool flow_gated_ = false;
};
