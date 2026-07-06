#include "config_store.h"

#include "inventory_store.h"

namespace {

uint32_t inventoryRecordCrc(const InventoryRecord& record) {
  InventoryRecord copy = record;
  copy.crc32 = 0;
  uint32_t crc = ~0U;
  const auto* data = reinterpret_cast<const uint8_t*>(&copy);
  for (std::size_t i = 0; i < sizeof(copy); ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) {
      const uint32_t mask = -(crc & 1U);
      crc = (crc >> 1) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

uint32_t configRecordCrc(const ConfigRecord& record) {
  ConfigRecord copy = record;
  copy.crc32 = 0;
  uint32_t crc = ~0U;
  const auto* data = reinterpret_cast<const uint8_t*>(&copy);
  for (std::size_t i = 0; i < sizeof(copy); ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) {
      const uint32_t mask = -(crc & 1U);
      crc = (crc >> 1) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

}  // namespace

bool commitMachineStores(ConfigStore& config, InventoryStore& inventory, void (*feed_wdt)()) {
  const bool config_dirty = config.dirty();
  const bool inventory_dirty = inventory.dirty();
  if (!config_dirty && !inventory_dirty) {
    return true;
  }
  if (!config_dirty) {
    return inventory.commit(feed_wdt);
  }
  if (!inventory_dirty) {
    return config.commit(feed_wdt);
  }

  const NvsOps* ops = config.ops_;
  if (ops == nullptr || ops->begin == nullptr || ops->setBlob == nullptr || ops->commit == nullptr) {
    return false;
  }
  if (!ops->begin(kNvsNamespace)) {
    return false;
  }

  config.record_.crc32 = configRecordCrc(config.record_);
  inventory.record_.crc32 = inventoryRecordCrc(inventory.record_);

  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  if (!ops->setBlob(kConfigBlobKey, &config.record_, sizeof(config.record_))) {
    return false;
  }
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  if (!ops->setBlob(kInventoryBlobKey, &inventory.record_, sizeof(inventory.record_))) {
    return false;
  }
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  if (!ops->commit()) {
    return false;
  }
  config.dirty_ = false;
  inventory.dirty_ = false;
  return true;
}
