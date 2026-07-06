#include "inventory_store.h"

#include <cmath>
#include <cstring>

#include "crc32.h"
#include "inventory_policy.h"

namespace {

bool ingredientIdValid(const char* ingredient_id) {
  if (ingredient_id == nullptr || ingredient_id[0] == '\0') {
    return false;
  }
  const std::size_t len = strnlen(ingredient_id, kIngredientIdMax);
  return len > 0 && len < kIngredientIdMax;
}

void sanitizeEntry(InventoryEntry& entry, bool& changed) {
  if (!entry.active) {
    return;
  }
  if (!ingredientIdValid(entry.ingredient_id)) {
    entry = InventoryEntry{};
    changed = true;
    return;
  }
  if (!std::isfinite(entry.bottle_size_ml) || entry.bottle_size_ml <= 0.0f) {
    entry.bottle_size_ml = kDefaultBottleSizeMl;
    changed = true;
  }
  if (!std::isfinite(entry.remaining_ml) || entry.remaining_ml < 0.0f) {
    entry.remaining_ml = entry.bottle_size_ml;
    changed = true;
  }
  if (entry.remaining_ml > entry.bottle_size_ml) {
    entry.remaining_ml = entry.bottle_size_ml;
    changed = true;
  }
}

}  // namespace

static_assert(sizeof(InventoryEntry) == 40,
              "InventoryEntry layout changed — bump kInventorySchemaVersion");
static_assert(sizeof(InventoryRecord) == 652,
              "InventoryRecord layout changed — bump kInventorySchemaVersion");

void InventoryStore::begin(const NvsOps& ops) {
  ops_ = &ops;
  dirty_ = false;

  if (ops_->begin == nullptr || ops_->getBlob == nullptr || ops_->setBlob == nullptr) {
    record_ = InventoryRecord{};
    record_.crc32 = crc32OfRecord(record_);
    dirty_ = true;
    return;
  }
  if (!ops_->begin(kNvsNamespace)) {
    record_ = InventoryRecord{};
    record_.crc32 = crc32OfRecord(record_);
    dirty_ = true;
    return;
  }

  if (!ops_->getBlob(kInventoryBlobKey, &record_, sizeof(record_))) {
    record_ = InventoryRecord{};
    record_.crc32 = crc32OfRecord(record_);
    dirty_ = true;
    return;
  }
  if (record_.magic != kInventoryMagic || record_.version != kInventorySchemaVersion ||
      record_.crc32 != crc32OfRecord(record_)) {
    record_ = InventoryRecord{};
    record_.crc32 = crc32OfRecord(record_);
    dirty_ = true;
    return;
  }
  bool sanitized = false;
  for (uint8_t i = 0; i < kMaxInventoryEntries; ++i) {
    sanitizeEntry(record_.entries[i], sanitized);
  }
  dirty_ = sanitized;
}

const InventoryEntry* InventoryStore::findEntry(const char* ingredient_id) const {
  if (!ingredientIdValid(ingredient_id)) {
    return nullptr;
  }
  for (uint8_t i = 0; i < kMaxInventoryEntries; ++i) {
    const InventoryEntry& e = record_.entries[i];
    if (e.active && std::strncmp(e.ingredient_id, ingredient_id, kIngredientIdMax) == 0) {
      return &e;
    }
  }
  return nullptr;
}

InventoryEntry* InventoryStore::findEntryMutable(const char* ingredient_id) {
  return const_cast<InventoryEntry*>(findEntry(ingredient_id));
}

InventoryEntry* InventoryStore::allocEntry(const char* ingredient_id) {
  if (!ingredientIdValid(ingredient_id)) {
    return nullptr;
  }
  InventoryEntry* existing = findEntryMutable(ingredient_id);
  if (existing != nullptr) {
    return existing;
  }
  for (uint8_t i = 0; i < kMaxInventoryEntries; ++i) {
    InventoryEntry& e = record_.entries[i];
    if (!e.active) {
      e = InventoryEntry{};
      e.active = true;
      const std::size_t len = std::strlen(ingredient_id);
      std::memcpy(e.ingredient_id, ingredient_id, len);
      e.ingredient_id[len] = '\0';
      e.bottle_size_ml = kDefaultBottleSizeMl;
      e.remaining_ml = kDefaultBottleSizeMl;
      e.primed = false;
      dirty_ = true;
      return &e;
    }
  }
  return nullptr;
}

const InventoryEntry* InventoryStore::find(const char* ingredient_id) const {
  return findEntry(ingredient_id);
}

InventoryEntry* InventoryStore::findMutable(const char* ingredient_id) {
  return findEntryMutable(ingredient_id);
}

bool InventoryStore::seedOnBinding(const char* ingredient_id) {
  InventoryEntry* existing = findEntryMutable(ingredient_id);
  if (existing != nullptr) {
    return true;
  }
  InventoryEntry* e = allocEntry(ingredient_id);
  if (e == nullptr) {
    return false;
  }
  e->remaining_ml = e->bottle_size_ml;
  e->primed = false;
  dirty_ = true;
  return true;
}

void InventoryStore::clearIngredient(const char* ingredient_id) {
  InventoryEntry* e = findEntryMutable(ingredient_id);
  if (e == nullptr) {
    return;
  }
  *e = InventoryEntry{};
  dirty_ = true;
}

bool InventoryStore::setRemainingMl(const char* ingredient_id, float remaining_ml) {
  if (!ingredientIdValid(ingredient_id) || !std::isfinite(remaining_ml) || remaining_ml < 0.0f) {
    return false;
  }
  InventoryEntry* e = findEntryMutable(ingredient_id);
  if (e == nullptr) {
    return false;
  }
  e->remaining_ml = remaining_ml;
  dirty_ = true;
  return true;
}

bool InventoryStore::setBottleSizeMl(const char* ingredient_id, float bottle_size_ml) {
  if (!ingredientIdValid(ingredient_id) || !std::isfinite(bottle_size_ml) ||
      bottle_size_ml <= 0.0f) {
    return false;
  }
  InventoryEntry* e = findEntryMutable(ingredient_id);
  if (e == nullptr) {
    return false;
  }
  e->bottle_size_ml = bottle_size_ml;
  dirty_ = true;
  return true;
}

bool InventoryStore::refill(const char* ingredient_id) {
  InventoryEntry* e = allocEntry(ingredient_id);
  if (e == nullptr) {
    return false;
  }
  e->remaining_ml = e->bottle_size_ml;
  dirty_ = true;
  return true;
}

bool InventoryStore::setPrimed(const char* ingredient_id, bool primed) {
  InventoryEntry* e = findEntryMutable(ingredient_id);
  if (e == nullptr) {
    return false;
  }
  e->primed = primed;
  dirty_ = true;
  return true;
}

bool InventoryStore::subtractMl(const char* ingredient_id, float ml) {
  InventoryEntry* e = findEntryMutable(ingredient_id);
  if (e == nullptr || !std::isfinite(ml) || ml <= 0.0f) {
    return false;
  }
  e->remaining_ml -= ml;
  if (e->remaining_ml < 0.0f) {
    e->remaining_ml = 0.0f;
  }
  dirty_ = true;
  return true;
}

bool InventoryStore::pourAllowed(const char* ingredient_id, float step_ml) const {
  const InventoryEntry* e = findEntry(ingredient_id);
  if (e == nullptr) {
    return false;
  }
  return inventoryPourAllowed(e->primed, e->remaining_ml, step_ml);
}

bool InventoryStore::commit(void (*feed_wdt)()) {
  if (ops_ == nullptr || ops_->setBlob == nullptr) {
    return false;
  }
  record_.crc32 = crc32OfRecord(record_);
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  if (!ops_->setBlob(kInventoryBlobKey, &record_, sizeof(record_))) {
    return false;
  }
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  dirty_ = false;
  return true;
}
