#pragma once

#include <cstddef>
#include <cstdint>

#include "config.h"
#include "config_store.h"

// Per-ingredient inventory (remaining ml, bottle size, primed). Persisted as a
// versioned NVS blob separate from the machine config record. RAM-authoritative
// during pours; commit() runs idle-only from ControlTask (same policy as ConfigStore).

struct InventoryEntry {
  bool active = false;
  char ingredient_id[kIngredientIdMax] = {0};
  float remaining_ml = 0.0f;
  float bottle_size_ml = kDefaultBottleSizeMl;
  bool primed = false;
};

struct InventoryRecord {
  uint32_t magic = kInventoryMagic;
  uint16_t version = kInventorySchemaVersion;
  uint16_t reserved = 0;
  uint32_t crc32 = 0;
  InventoryEntry entries[kMaxInventoryEntries];
};

class InventoryStore {
 public:
  void begin(const NvsOps& ops);

  bool dirty() const {
    return dirty_;
  }

  // Lookup by ingredient id. Returns nullptr when not tracked.
  const InventoryEntry* find(const char* ingredient_id) const;
  InventoryEntry* findMutable(const char* ingredient_id);

  // Seed or reset on bind: remaining = bottle_size, primed = false.
  bool seedOnBinding(const char* ingredient_id);

  // Remove entry when ingredient unbound from a pump (best-effort).
  void clearIngredient(const char* ingredient_id);

  bool setRemainingMl(const char* ingredient_id, float remaining_ml);
  bool setBottleSizeMl(const char* ingredient_id, float bottle_size_ml);
  bool refill(const char* ingredient_id);
  bool setPrimed(const char* ingredient_id, bool primed);

  // Subtract after a successful pour step. Clamps at 0.
  bool subtractMl(const char* ingredient_id, float ml);

  // True when bound ingredient has primed == true and enough reserve ml.
  bool pourAllowed(const char* ingredient_id, float step_ml) const;

  // Serialize to NVS (flash write). Call only when idle.
  bool commit(void (*feed_wdt)() = nullptr);

 private:
  InventoryEntry* allocEntry(const char* ingredient_id);
  const InventoryEntry* findEntry(const char* ingredient_id) const;
  InventoryEntry* findEntryMutable(const char* ingredient_id);

  const NvsOps* ops_ = nullptr;
  InventoryRecord record_;
  bool dirty_ = false;
};
