#pragma once

#include <cstddef>
#include <cstdint>

// ESP32-S3-DevKitC-1 pin map — copied from firmware/bench-rig/include/config.h.
// TB6612FNG: AIN1/AIN2/PWMA = pump 1, BIN1/BIN2/PWMB = pump 2, STBY = enable.

namespace pins {

constexpr int kStandby = 18;  // PUMP_BUS_ENABLE; bench was 17

constexpr int kLedStatus = 38;  // right header; active high

// Hood 12 V COB ring (external low-side MOSFET). Free DevKit pin — do not reuse
// LED_STATUS (GPIO 38). Active high turns the FET on.
constexpr int kRingLight = 13;

// I2C → pump modules (Micro-Fit pins 5/6). Silk labels = GPIO numbers.
constexpr int kI2cSda = 5;
constexpr int kI2cScl = 4;

// HX711 — avoid USB (19/20), strapping (0, 45, 46).
// Bench was DT=8 / SCK=9; motherboard uses DT=6 / SCK=7.
constexpr int kScaleDout = 6;
constexpr int kScaleSck = 7;

}  // namespace pins

// As-built 4-pump module JST-XH (2026-11-10): red pump lead lands on schematic
// M− / pin 2, not M+ / pin 1. Invert IN1/IN2 so kForward = pour toward nozzle.
// SEED value only: each pump's polarity lives in NVS (ConfigStore, `pol` command)
// so a re-wired module or replacement pump can be corrected per channel.
// Bench-rig Pololu wiring is separate and stays non-inverted.
constexpr bool kDefaultInvertMotorPolarity = true;

// As-built 4-pump module pump order (2026-11-19 bench): firmware pump 1 ran the
// physical pump 3 position, 2→4, 3→1, 4→2. Maps logical slot (pump N within a
// module) to the MCP23017 GPA IN1/IN2 pair that drives it (pair p = GPA2p/GPA2p+1).
// Identity {0, 1, 2, 3} matches hardware/kicad/4-pump-module-spec.md.
constexpr uint8_t kModulePumpPair[4] = {2, 3, 0, 1};

// Pump-module I2C (MCP23017). Wire transfers run inside the 5 ms ControlTask loop,
// so keep the per-transfer timeout short; a timed-out transfer triggers a bus clear.
constexpr uint16_t kI2cTimeoutMs = 3;
// LED_STATUS blink (on/off each half period) while the pump drivers are enabled.
constexpr unsigned long kStatusLedBlinkHalfPeriodMs = 250;

// Idle re-probe of pump modules (hot-plug / expander reset / fault recovery).
constexpr unsigned long kPumpModuleRescanMs = 1000;

// Dispense defaults — copied from firmware/bench-rig/include/config.h (bench-validated
// 2026-06-27). Open-loop ml/s calibration model and anti-drip reverse; re-cal per line.
// These are the SEED values ConfigStore writes into a fresh (or reset) NVS record;
// per-pump calibration in NVS overrides them at runtime (see config_store.h).
constexpr float kDefaultMlPerSecond = 1.75f;
constexpr unsigned long kDefaultAntiDripMs = 100;

// Machine config / NVS (docs/16 "Machine config (NVS)"). RAM is session-authoritative
// during pours; ConfigStore::commit() flushes to flash only when idle (never on the
// motion path). The persisted record is sized to the documented pump_id domain (1..16)
// so adding I2C pump modules (docs/16 phase 7) does not force a schema reset.
constexpr uint8_t kMaxPumps = 16;
constexpr std::size_t kIngredientIdMax = 24;  // includes the NUL terminator

// Soft concurrency ceiling on PumpBus::run (GST60 headroom; see docs/12).
constexpr uint8_t kMaxConcurrentPumps = 6;

// Max steps / phases in one pour sequence. Steps within a phase run concurrently
// (up to kMaxConcurrentPumps); phases run in order.
constexpr uint8_t kMaxPourSequenceSteps = 16;
constexpr uint8_t kMaxPourPhases = 16;

// Blob is guarded by magic + schema version; a mismatch resets to seed defaults
// (docs/16: "Version the schema; migrate or reset on breaking changes.").
constexpr uint32_t kConfigMagic = 0x524D4331;   // 'RMC1'
constexpr uint16_t kConfigSchemaVersion = 3;    // v3: per-pump invert_polarity
constexpr uint16_t kConfigSchemaVersionV2 = 2;  // migrated in place (same size)
constexpr const char* kNvsNamespace = "rumtime";
constexpr const char* kConfigBlobKey = "cfg";

// Calibration sanity bounds — ConfigStore rejects out-of-range writes so a garbage
// value can never reach the coordinator's pour math. anti-drip reverse is bounded
// because an unbounded reverse purge is a spill risk (AGENTS.md safety guardrails).
constexpr float kMinMlPerSecond = 0.01f;
constexpr float kMaxMlPerSecond = 100.0f;
constexpr uint32_t kMaxAntiDripMs = 5000;

// Dispense safety ceilings. Open-loop timed mode trusts (ml * calibration), so a
// malformed / mis-calibrated request could otherwise run a pump unbounded. The
// coordinator REJECTS (does not silently clamp) any job exceeding either limit,
// so the operator never gets a wrong volume without notice. The effective max
// volume at a given pump rate is min(kMaxDispenseMl, ml_per_s * kMaxPourDurationMs / 1000).
constexpr float kMaxDispenseMl = 500.0f;
constexpr unsigned long kMaxPourDurationMs = 120000;  // 120 s hard pump-on ceiling
constexpr unsigned long kMaxPrimeDurationMs = 60000;  // 60 s continuous-prime safety cutoff

// Multi-step pour sequence aggregate safety (v1). Per-step ceilings still apply;
// these caps block pathological totals (e.g. 16 × kMaxDispenseMl). No v1 cocktail
// exceeds ~200 ml pumped; kMaxSequenceTotalMl matches single-pour max as a default.
constexpr float kMaxSequenceTotalMl = kMaxDispenseMl;
constexpr unsigned long kMaxSequenceDurationMs = kMaxPourDurationMs;

// ControlTask period — docs/16 default 5 ms (1–10 ms acceptable).
constexpr unsigned long kControlTaskPeriodMs = 5;

// ControlTask placement — docs/16: Core 1, priority above async HTTP/Wi-Fi.
constexpr int kControlTaskCore = 1;
constexpr unsigned int kControlTaskPriority = 10;
// ESP-IDF xTaskCreatePinnedToCore expects stack depth in bytes.
// StatusSnapshot is ~1376 B; tick()/serial must avoid stacking many copies.
// 16 KiB leaves margin for parse + one snapshot + HX711 bring-up.
constexpr unsigned int kControlTaskStackBytes = 16384;
constexpr unsigned int kControlTaskWdtTimeoutMs = 2000;

// Idle NVS commit retry interval when a prior commit failed (avoid hammering flash).
constexpr unsigned long kConfigCommitRetryMs = 1000;

// Scale (HX711) — copied from firmware/bench-rig/include/config.h.
// HX711 calibration factor — LS fit 2026-08-20 on 180 g + 714 g (tare empty).
constexpr float kScaleCalibrationFactor = 374.76f;

// Flow-gate defaults — tune via Test 9 (docs/06-flow-calibration-and-inventory.md).
constexpr float kFlowThresholdG = 0.03f;
constexpr int kFlowDetectConsecutive = 3;
constexpr unsigned long kFlowDetectTimeoutMs = 5000;

// Glass-present (provisional until Test 7.2 locks the heuristic). After tare,
// empty platform ≈ 0 g; any drinking glass is typically well above this floor.
constexpr float kGlassPresentMinGrams = 50.0f;

// Rolling average depth for readFilteredGrams() (RAM only). Also the raw-sample
// count for a tare, spread across ControlTask ticks (never blocking).
constexpr uint8_t kScaleFilterReads = 3;
static_assert(kScaleFilterReads > 0, "kScaleFilterReads must be > 0");

// Bounded HX711 init wait in begin() only (setup(), never in tick()).
constexpr unsigned long kScaleBeginTimeoutMs = 2000;

// Boot plausibility probe: this many raw conversions must not be frozen (all
// identical, e.g. a floating DOUT clocking out zeros) or saturated (HX711 rails,
// e.g. load cell disconnected) or the scale never reports ready.
constexpr uint8_t kScaleProbeReads = 4;
constexpr long kHx711RawMax = 0x7FFFFF;
constexpr long kHx711RawMin = -0x800000;

// No successful conversion within this window marks the scale stale (not ready).
constexpr unsigned long kScaleStaleTimeoutMs = 1000;

// Firmware version string exposed on GET /status (kiosk deviceStatusSchema).
constexpr const char* kFirmwareVersion = "0.2.0";

// Network (phase 5 — STA-only, serial provisioning until captive portal).
constexpr const char* kMdnsHostname = "rumtime";
constexpr const char* kMdnsHostFqdn = "rumtime.local";
constexpr uint16_t kHttpPort = 80;
constexpr int kNetworkTaskCore = 0;
constexpr unsigned int kNetworkTaskPriority = 4;
// 16 KiB: handlePour() holds a PourSequenceCommand + StatusSnapshot (~4.4 KB frame)
// under the ArduinoJson parse; 8 KiB overflowed (stack canary panic on POST /pour, 2026-11-19).
constexpr unsigned int kNetworkTaskStackBytes = 16384;
// ArduinoJson recurses per nesting level; cap it for every HTTP body. The deepest
// legit body is POST /pour {phases:[{steps:[{…}]}]} (object/array/object/array/object).
constexpr uint8_t kHttpJsonNestingLimit = 5;

// Stack guard rails. Runtime: ControlTask samples both tasks' high-water marks
// every kStackSampleMs (published as GET /status link.stackFree); dropping below
// kStackLowWaterBytes free prints a `// stack:low` serial line. Compile time: platformio.ini
// fails the build on any src/ frame over -Wstack-usage (see README "Stack budget").
constexpr uint32_t kStackLowWaterBytes = 2048;
constexpr unsigned long kStackSampleMs = 1000;

// Wi-Fi reconnect timing (STA-only; event-driven disconnect + backoff).
constexpr unsigned long kWifiReconnectCooldownMs = 500;
constexpr unsigned long kWifiReconnectBackoffMs = 10000;
constexpr unsigned long kWifiConnectTimeoutMs = 45000;

// Kiosk HTTP heartbeat while an HTTP-started job is busy.
// Kiosk polls GET /status at ~500 ms; miss several polls → cancel.
// STA disconnect still cancels immediately (wifi_link_safety); this covers
// "Wi-Fi up, kiosk dead/backgrounded" and is a backup if the STA event is missed.
constexpr unsigned long kKioskHeartbeatTimeoutMs = 3000;

// Wi-Fi credentials NVS (separate from machine config blob).
constexpr const char* kWifiCredNamespace = "rumtime-wifi";
constexpr const char* kWifiSsidKey = "wifi_ssid";
constexpr const char* kWifiPassKey = "wifi_pass";

// Recipe id on POST /pour (kiosk correlation only; max chars including NUL).
constexpr std::size_t kRecipeIdMax = 32;

// Inventory (phase 5 — parallel NVS blob keyed by ingredient id).
constexpr uint32_t kInventoryMagic = 0x524D494E;  // 'RMIN'
constexpr uint16_t kInventorySchemaVersion = 1;
constexpr const char* kInventoryBlobKey = "inv";
constexpr uint8_t kMaxInventoryEntries = 16;
constexpr float kDefaultBottleSizeMl = 750.0f;
constexpr float kInventoryReserveMl = 10.0f;  // matches kiosk INVENTORY_RESERVE_ML

// Recipe job terminal latch on GET /status (kiosk pour-page complete detection).
// Long enough to survive a brief Wi-Fi blip / missed poll after cancel or flow-timeout.
constexpr unsigned long kJobTerminalLatchMs = 3000;
