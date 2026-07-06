#pragma once

#include <cstddef>
#include <cstdint>

#include "config.h"

// Machine config store (docs/16 "Machine config (NVS)"). Owns the RAM-authoritative
// per-pump calibration and ingredient bindings that used to be the config.h
// kDefault* constants. The coordinator reads ml/s + anti-drip from here per pump.
//
// RAM is authoritative during a session; commit() serializes the record to NVS and
// is the ONLY place a flash write happens — call it when idle (never on the motion
// path). Mutators only touch RAM and set dirty(); nothing blocks the ControlTask
// tick until an explicit idle commit.
//
// Host-testable: all NVS I/O lives behind the injected NvsOps seam (mirrors
// GpioOps / ScaleOps). Native tests use an in-memory fake; the ESP32 build wires
// Preferences in control_task.cpp.

// Injected NVS seam. getBlob returns true only when a blob of EXACTLY len bytes
// exists (so a stale, differently-sized record reads as absent -> defaults).
// setBlob performs the flash write (immediate for Arduino Preferences::putBytes).
struct NvsOps {
  bool (*begin)(const char* ns);
  bool (*getBlob)(const char* key, void* out, std::size_t len);
  bool (*setBlob)(const char* key, const void* data, std::size_t len);
};

struct PumpConfig {
  bool bound = false;
  char ingredient_id[kIngredientIdMax] = {0};
  float ml_per_s = kDefaultMlPerSecond;
  uint32_t anti_drip_ms = static_cast<uint32_t>(kDefaultAntiDripMs);
};

// POD record persisted as a single NVS blob. magic + version + num_pumps guard
// against a stale/foreign/resized record; any mismatch resets to seed defaults.
struct ConfigRecord {
  uint32_t magic = kConfigMagic;
  uint16_t version = kConfigSchemaVersion;
  uint16_t num_pumps = kMaxPumps;
  uint32_t crc32 = 0;
  PumpConfig pumps[kMaxPumps];
};

class InventoryStore;

class ConfigStore {
 public:
  // Loads the record from NVS via ops; seeds defaults when absent/invalid.
  // Clears dirty. Safe to call once in setup(), before the ControlTask runs.
  void begin(const NvsOps& ops);

  // Reset RAM to seed defaults (config.h kDefault*). Does not write NVS; leaves
  // the store marked dirty so the next idle commit persists the fresh record.
  void loadDefaults();

  uint8_t numPumps() const {
    return kMaxPumps;
  }

  // Per-pump calibration used by the coordinator. Out-of-range channels return
  // the seed defaults so a bad index can never produce a zero/garbage pour rate.
  float mlPerSecond(uint8_t channel) const;
  uint32_t antiDripMs(uint8_t channel) const;

  bool bound(uint8_t channel) const;
  const char* ingredient(uint8_t channel) const;              // "" when unbound / out of range
  int channelForIngredient(const char* ingredient_id) const;  // -1 when none

  // Mutators — RAM only, set dirty(). Return false (no change) on a bad channel
  // or out-of-range value. Persist by calling commit() when idle.
  bool setCalibration(uint8_t channel, float ml_per_s, uint32_t anti_drip_ms);
  bool setBinding(uint8_t channel, const char* ingredient_id);
  bool clearBinding(uint8_t channel);

  bool dirty() const {
    return dirty_;
  }

  // Serialize the RAM record to NVS (the flash write). Call ONLY when idle — this
  // can block for a flash cycle and must never run during a pour (docs/16 rule 8).
  // feed_wdt may be called around the blocking write (ESP32 TWDT safety).
  // Clears dirty on success. Returns false if not begun or the NVS write failed.
  bool commit(void (*feed_wdt)() = nullptr);

  // Combined NVS transaction when both stores are dirty (power-loss safe).
  friend bool commitMachineStores(ConfigStore& config, InventoryStore& inventory,
                                  void (*feed_wdt)());

 private:
  bool valid(uint8_t channel) const {
    return channel < kMaxPumps;
  }

  const NvsOps* ops_ = nullptr;
  ConfigRecord record_;
  bool dirty_ = false;
};

bool commitMachineStores(ConfigStore& config, InventoryStore& inventory,
                         void (*feed_wdt)() = nullptr);
