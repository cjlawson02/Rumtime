#include "config_store.h"

#include <cmath>
#include <cstring>

#include "crc32.h"

namespace {

bool calibrationValid(float ml_per_s, uint32_t anti_drip_ms) {
  return std::isfinite(ml_per_s) && ml_per_s >= kMinMlPerSecond && ml_per_s <= kMaxMlPerSecond &&
         anti_drip_ms <= kMaxAntiDripMs;
}

bool bindingValid(const PumpConfig& pump) {
  if (!pump.bound) {
    return true;
  }
  const std::size_t len = strnlen(pump.ingredient_id, kIngredientIdMax);
  return len > 0 && len < kIngredientIdMax;
}

void sanitizePumpConfig(PumpConfig& pump, bool& changed) {
  if (!calibrationValid(pump.ml_per_s, pump.anti_drip_ms)) {
    pump.ml_per_s = kDefaultMlPerSecond;
    pump.anti_drip_ms = static_cast<uint32_t>(kDefaultAntiDripMs);
    changed = true;
  }
  if (!bindingValid(pump)) {
    pump.bound = false;
    std::memset(pump.ingredient_id, 0, kIngredientIdMax);
    changed = true;
  }
}

float clampMlPerSecond(float ml_per_s) {
  if (!std::isfinite(ml_per_s) || ml_per_s < kMinMlPerSecond || ml_per_s > kMaxMlPerSecond) {
    return kDefaultMlPerSecond;
  }
  return ml_per_s;
}

uint32_t clampAntiDripMs(uint32_t anti_drip_ms) {
  return anti_drip_ms > kMaxAntiDripMs ? static_cast<uint32_t>(kDefaultAntiDripMs) : anti_drip_ms;
}

}  // namespace

static_assert(sizeof(PumpConfig) == 36, "PumpConfig layout changed — bump kConfigSchemaVersion");
static_assert(sizeof(ConfigRecord) == 588,
              "ConfigRecord layout changed — bump kConfigSchemaVersion");

void ConfigStore::loadDefaults() {
  record_ = ConfigRecord{};  // magic/version/num_pumps + per-pump seed defaults
  record_.crc32 = crc32OfRecord(record_);
  // A freshly reset record has not been persisted yet; mark dirty so the next
  // idle commit writes it (so a corrupt/foreign blob is repaired on flash too).
  dirty_ = true;
}

void ConfigStore::begin(const NvsOps& ops) {
  ops_ = &ops;
  dirty_ = false;

  if (ops_->begin == nullptr || ops_->getBlob == nullptr || ops_->setBlob == nullptr) {
    loadDefaults();
    return;
  }
  if (!ops_->begin(kNvsNamespace)) {
    loadDefaults();
    return;
  }

  if (!ops_->getBlob(kConfigBlobKey, &record_, sizeof(record_))) {
    loadDefaults();  // no stored record yet
    return;
  }
  // Guard against a stale / foreign / resized record (docs/16: reset on breaking change).
  if (record_.magic != kConfigMagic || record_.version != kConfigSchemaVersion ||
      record_.num_pumps != kMaxPumps) {
    loadDefaults();
    return;
  }
  if (record_.crc32 != crc32OfRecord(record_)) {
    loadDefaults();
    return;
  }
  bool sanitized = false;
  for (uint8_t ch = 0; ch < kMaxPumps; ++ch) {
    sanitizePumpConfig(record_.pumps[ch], sanitized);
  }
  dirty_ = sanitized;
}

float ConfigStore::mlPerSecond(uint8_t channel) const {
  if (!valid(channel)) {
    return kDefaultMlPerSecond;
  }
  return clampMlPerSecond(record_.pumps[channel].ml_per_s);
}

uint32_t ConfigStore::antiDripMs(uint8_t channel) const {
  if (!valid(channel)) {
    return static_cast<uint32_t>(kDefaultAntiDripMs);
  }
  return clampAntiDripMs(record_.pumps[channel].anti_drip_ms);
}

bool ConfigStore::bound(uint8_t channel) const {
  return valid(channel) && record_.pumps[channel].bound;
}

const char* ConfigStore::ingredient(uint8_t channel) const {
  if (!bound(channel)) {
    return "";
  }
  return record_.pumps[channel].ingredient_id;
}

int ConfigStore::channelForIngredient(const char* ingredient_id) const {
  if (ingredient_id == nullptr || ingredient_id[0] == '\0') {
    return -1;
  }
  for (uint8_t ch = 0; ch < kMaxPumps; ++ch) {
    if (record_.pumps[ch].bound &&
        std::strncmp(record_.pumps[ch].ingredient_id, ingredient_id, kIngredientIdMax) == 0) {
      return ch;
    }
  }
  return -1;
}

bool ConfigStore::setCalibration(uint8_t channel, float ml_per_s, uint32_t anti_drip_ms) {
  if (!valid(channel)) {
    return false;
  }
  // Reject garbage before it can reach the coordinator's pour math.
  if (!calibrationValid(ml_per_s, anti_drip_ms)) {
    return false;
  }
  record_.pumps[channel].ml_per_s = ml_per_s;
  record_.pumps[channel].anti_drip_ms = anti_drip_ms;
  dirty_ = true;
  return true;
}

bool ConfigStore::setBinding(uint8_t channel, const char* ingredient_id) {
  if (!valid(channel) || ingredient_id == nullptr || ingredient_id[0] == '\0') {
    return false;
  }
  const std::size_t len = std::strlen(ingredient_id);
  if (len >= kIngredientIdMax) {
    return false;  // does not fit with a NUL terminator
  }
  const int existing = channelForIngredient(ingredient_id);
  if (existing >= 0 && static_cast<uint8_t>(existing) != channel) {
    return false;  // ingredient already bound elsewhere
  }
  PumpConfig& pump = record_.pumps[channel];
  std::memset(pump.ingredient_id, 0, kIngredientIdMax);
  std::memcpy(pump.ingredient_id, ingredient_id, len);
  pump.bound = true;
  dirty_ = true;
  return true;
}

bool ConfigStore::clearBinding(uint8_t channel) {
  if (!valid(channel)) {
    return false;
  }
  PumpConfig& pump = record_.pumps[channel];
  pump.bound = false;
  std::memset(pump.ingredient_id, 0, kIngredientIdMax);
  dirty_ = true;
  return true;
}

bool ConfigStore::commit(void (*feed_wdt)()) {
  if (ops_ == nullptr || ops_->setBlob == nullptr) {
    return false;
  }
  record_.crc32 = crc32OfRecord(record_);
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  if (!ops_->setBlob(kConfigBlobKey, &record_, sizeof(record_))) {
    return false;
  }
  if (feed_wdt != nullptr) {
    feed_wdt();
  }
  dirty_ = false;
  return true;
}
