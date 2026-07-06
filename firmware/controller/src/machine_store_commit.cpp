#include "config_store.h"
#include "crc32.h"
#include "inventory_store.h"

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
  if (ops == nullptr || ops->begin == nullptr || ops->setBlob == nullptr) {
    return false;
  }
  if (!ops->begin(kNvsNamespace)) {
    return false;
  }

  config.record_.crc32 = crc32OfRecord(config.record_);
  inventory.record_.crc32 = crc32OfRecord(inventory.record_);

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
  config.dirty_ = false;
  inventory.dirty_ = false;
  return true;
}
