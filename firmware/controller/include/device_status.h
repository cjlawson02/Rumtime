#pragma once

#include <cstdint>
#include <string>

#include "config.h"
#include "status_snapshot.h"

// Wire values for StatusSnapshot::pump_job_purpose (maps to kiosk pumpJobPurposeSchema).
enum class PumpJobPurposeWire : uint8_t {
  kNone = 0,
  kPrime = 1,
  kCalibration = 2,
  kVerify = 3,
};

struct DeviceStatusInputs {
  bool wifi_connected = false;
  const char* hostname = kMdnsHostFqdn;
  const char* firmware_version = kFirmwareVersion;
  unsigned long now_ms = 0;
  const StatusSnapshot* snapshot = nullptr;
};

std::string buildDeviceStatusJson(const DeviceStatusInputs& in);

int computeSequenceProgressPercent(uint8_t step_index, uint8_t step_count);
int computeTimedPumpProgressPercent(unsigned long elapsed_ms, unsigned long duration_ms);
const char* pourStepLabel(const char* ingredient_id);
const char* pumpJobStepLabel(PumpJobPurposeWire purpose);
