#include "inventory_store.h"

#include <cmath>
#include <cstring>

namespace {

uint32_t crc32Update(uint32_t crc, const uint8_t* data, std::size_t len) {
  crc = ~crc;
  for (std::size_t i = 0; i < len; ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) {
      const uint32_t mask = -(crc & 1U);
      crc = (crc >> 1) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

uint32_t recordCrc(const InventoryRecord& record) {
  InventoryRecord copy = record;
  copy.crc32 = 0;
  return crc32Update(0, reinterpret_cast<const uint8_t*>(&copy), sizeof(copy));
}

bool ingredientIdValid(const char* ingredient_id) {
  if (ingredient_id == nullptr || ingredient_id[0] == '\0') {
    return false;
  }
  const std::size_t len = strnlen(ingredient_id, kIngredientIdMax);
  return len > 0 && len < kIngredientIdMax;
}

}  // namespace

static_assert(sizeof(InventoryEntry) == 40, "InventoryEntry layout changed — bump kInventorySchemaVersion");
static_assert(sizeof(InventoryRecord) == 652, "InventoryRecord layout changed — bump kInventorySchemaVersion");

void InventoryStore::begin(const NvsOps& ops) {
  ops_ = &ops;
  dirty_ = false;

  if (ops_->begin == nullptr || ops_->getBlob == nullptr || ops_->setBlob == nullptr ||
      ops_->commit == nullptr) {
    record_ = InventoryRecord{};
    record_.crc32 = recordCrc(record_);
    dirty_ = true;
    return;
  }
  if (!ops_->begin(kNvsNamespace)) {
    record_ = InventoryRecord{};
    record_.crc32 = recordCrc(record_);
    dirty_ = true;
    return;
  }

  if (!ops_->getBlob(kInventoryBlobKey, &record_, sizeof(record_))) {
    record_ = InventoryRecord{};
    record_.crc32 = recordCrc(record_);
    dirty_ = true;
    return;
  }
  if (record_.magic != kInventoryMagic || record_.version != kInventorySchemaVersion ||
      record_.crc32 != recordCrc(record_)) {
    record_ = InventoryRecord{};
    record_.crc32 = recordCrc(record_);
    dirty_ = true;
  }
}

const InventoryEntry* InventoryStore::findEntry(const char* ingredient_id) const {
  if (!ingredientIdValid(ingredient_id)) {
    return nullptr;
  }
  for (uint8_t i = 0; i < kMaxInventoryEntries; ++i) {
    const InventoryEntry& e = record_.entries[i];
    if (e.active &&
        std::strncmp(e.ingredient_id, ingredient_id, kIngredientIdMax) == 0) {
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
  InventoryEntry* e = allocEntry(ingredient_id);
  if (e == nullptr) {
    return false;
  }
  e->remaining_ml = remaining_ml;
  dirty_ = true;
  return true;
}

bool InventoryStore::setBottleSizeMl(const char* ingredient_id, float bottle_size_ml) {
  if (!ingredientIdValid(ingredient_id) || !std::isfinite(bottle_size_ml) || bottle_size_ml <= 0.0f) {
    return false;
  }
  InventoryEntry* e = allocEntry(ingredient_id);
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
  InventoryEntry* e = allocEntry(ingredient_id);
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
  if (e == nullptr || !e->primed) {
    return false;
  }
  if (!std::isfinite(step_ml) || step_ml <= 0.0f) {
    return false;
  }
  return e->remaining_ml >= (step_ml + kInventoryReserveMl);
}

bool InventoryStore::commit(void (*feed_wdt)()) {
  if (ops_ == nullptr || ops_->setBlob == nullptr || ops_->commit == nullptr) {
    return false;
  }
  record_.crc32 = recordCrc(record_);
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  if (!ops_->setBlob(kInventoryBlobKey, &record_, sizeof(record_))) {
    return false;
  }
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  if (!ops_->commit()) {
    return false;
  }
  dirty_ = false;
  return true;
}
