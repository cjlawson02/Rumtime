#pragma once

#include "command_queue.h"
#include "status_snapshot.h"

// Link-loss safety: kiosk cannot POST cancel when RF drops or the UI dies.
// NetworkTask uses STA falling-edge; ControlTask uses HTTP heartbeat timeout.

inline bool jobMotionBusy(const StatusSnapshot& s) {
  return s.job_busy || s.sequence_busy || s.pumps_running;
}

inline bool shouldCancelOnWifiLost(bool was_connected, bool now_connected,
                                   const StatusSnapshot& s) {
  return was_connected && !now_connected && jobMotionBusy(s);
}

// Returns true when cancel was enqueued.
inline bool cancelOnWifiLost(CommandQueue& queue, bool was_connected, bool now_connected,
                             const StatusSnapshot& s) {
  if (!shouldCancelOnWifiLost(was_connected, now_connected, s)) {
    return false;
  }
  queue.enqueueCancel();
  return true;
}

inline bool shouldCancelOnHeartbeatTimeout(bool watchdog_armed, bool motion_busy,
                                           unsigned long now_ms, unsigned long last_http_ms,
                                           unsigned long timeout_ms) {
  if (!watchdog_armed || !motion_busy) {
    return false;
  }
  return (now_ms - last_http_ms) > timeout_ms;
}

// Returns true when cancel was enqueued.
inline bool cancelOnHeartbeatTimeout(CommandQueue& queue, bool watchdog_armed, bool motion_busy,
                                     unsigned long now_ms, unsigned long last_http_ms,
                                     unsigned long timeout_ms) {
  if (!shouldCancelOnHeartbeatTimeout(watchdog_armed, motion_busy, now_ms, last_http_ms,
                                      timeout_ms)) {
    return false;
  }
  queue.enqueueCancel();
  return true;
}
