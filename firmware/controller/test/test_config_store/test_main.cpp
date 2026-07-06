#include <unity.h>

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

#include "config.h"
#include "config_store.h"

namespace {

// --- Stateful in-memory fake NVS (one "cfg" blob) so tests exercise the real
// serialize -> flash -> reload round trip through the injected seam. ---

class FakeNvs {
 public:
  std::vector<unsigned char> blob;
  bool has = false;
  bool begin_result = true;

  void storeRecord(const ConfigRecord& record) {
    const unsigned char* bytes = reinterpret_cast<const unsigned char*>(&record);
    blob.assign(bytes, bytes + sizeof(record));
    has = true;
  }
};

FakeNvs* g_nvs = nullptr;

bool fakeBegin(const char*) {
  return g_nvs->begin_result;
}
bool fakeGetBlob(const char*, void* out, std::size_t len) {
  if (!g_nvs->has || g_nvs->blob.size() != len) {
    return false;
  }
  std::memcpy(out, g_nvs->blob.data(), len);
  return true;
}
bool fakeSetBlob(const char*, const void* data, std::size_t len) {
  const unsigned char* bytes = static_cast<const unsigned char*>(data);
  g_nvs->blob.assign(bytes, bytes + len);
  g_nvs->has = true;
  return true;
}
bool fakeCommit() {
  return true;
}
NvsOps makeNvsOps() {
  return NvsOps{fakeBegin, fakeGetBlob, fakeSetBlob, fakeCommit};
}

FakeNvs g_backing;

uint32_t testRecordCrc(const ConfigRecord& record) {
  ConfigRecord copy = record;
  copy.crc32 = 0;
  uint32_t crc = ~0U;
  const auto* bytes = reinterpret_cast<const uint8_t*>(&copy);
  for (std::size_t i = 0; i < sizeof(copy); ++i) {
    crc ^= bytes[i];
    for (int bit = 0; bit < 8; ++bit) {
      const uint32_t mask = -(crc & 1U);
      crc = (crc >> 1) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

ConfigRecord makeValidRecord() {
  ConfigRecord record{};
  record.crc32 = testRecordCrc(record);
  return record;
}

void resetBacking() {
  g_backing = FakeNvs{};
  g_nvs = &g_backing;
}

void test_defaults_when_no_record() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);

  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
  TEST_ASSERT_EQUAL_UINT32(static_cast<uint32_t>(kDefaultAntiDripMs), store.antiDripMs(0));
  TEST_ASSERT_FALSE(store.bound(0));
  TEST_ASSERT_EQUAL_STRING("", store.ingredient(0));
  // A fresh/seeded record is not yet persisted, so it must be dirty for the next
  // idle commit to write it (repairs a missing/corrupt blob on flash).
  TEST_ASSERT_TRUE(store.dirty());
}

void test_set_calibration_roundtrip_via_commit() {
  resetBacking();
  NvsOps ops = makeNvsOps();

  ConfigStore writer;
  writer.begin(ops);
  TEST_ASSERT_TRUE(writer.setCalibration(1, 2.5f, 250));
  TEST_ASSERT_TRUE(writer.dirty());
  TEST_ASSERT_TRUE(writer.commit());
  TEST_ASSERT_FALSE(writer.dirty());

  // A fresh store over the same backing NVS must read the persisted values.
  ConfigStore reader;
  reader.begin(ops);
  TEST_ASSERT_FALSE(reader.dirty());
  TEST_ASSERT_EQUAL_FLOAT(2.5f, reader.mlPerSecond(1));
  TEST_ASSERT_EQUAL_UINT32(250, reader.antiDripMs(1));
  // Untouched channel keeps its seed default.
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, reader.mlPerSecond(0));
}

void test_set_calibration_rejects_bad_values() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);

  const float inf = std::numeric_limits<float>::infinity();
  const float nan = std::numeric_limits<float>::quiet_NaN();
  TEST_ASSERT_FALSE(store.setCalibration(0, nan, 100));
  TEST_ASSERT_FALSE(store.setCalibration(0, inf, 100));
  TEST_ASSERT_FALSE(store.setCalibration(0, 0.0f, 100));                    // <= 0
  TEST_ASSERT_FALSE(store.setCalibration(0, kMinMlPerSecond * 0.5f, 100));  // below min
  TEST_ASSERT_FALSE(store.setCalibration(0, kMaxMlPerSecond + 1.0f, 100));  // above max
  TEST_ASSERT_FALSE(store.setCalibration(0, 2.0f, kMaxAntiDripMs + 1));     // anti-drip too long
  // A rejected write leaves the seed default in place.
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
}

void test_set_calibration_bad_channel() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_FALSE(store.setCalibration(kMaxPumps, 2.0f, 100));
}

void test_binding_set_lookup_clear() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);

  TEST_ASSERT_TRUE(store.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(store.bound(0));
  TEST_ASSERT_EQUAL_STRING("bourbon", store.ingredient(0));
  TEST_ASSERT_EQUAL_INT(0, store.channelForIngredient("bourbon"));
  TEST_ASSERT_EQUAL_INT(-1, store.channelForIngredient("simple"));

  TEST_ASSERT_TRUE(store.clearBinding(0));
  TEST_ASSERT_FALSE(store.bound(0));
  TEST_ASSERT_EQUAL_STRING("", store.ingredient(0));
  TEST_ASSERT_EQUAL_INT(-1, store.channelForIngredient("bourbon"));
}

void test_binding_rejects_empty_and_too_long() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);

  TEST_ASSERT_FALSE(store.setBinding(0, ""));
  TEST_ASSERT_FALSE(store.setBinding(0, nullptr));
  std::string too_long(kIngredientIdMax, 'x');  // no room for NUL
  TEST_ASSERT_FALSE(store.setBinding(0, too_long.c_str()));
  TEST_ASSERT_FALSE(store.bound(0));
  // Exactly max-1 chars fits.
  std::string just_fits(kIngredientIdMax - 1, 'y');
  TEST_ASSERT_TRUE(store.setBinding(0, just_fits.c_str()));
  TEST_ASSERT_EQUAL_STRING(just_fits.c_str(), store.ingredient(0));
}

void test_out_of_range_accessors_return_defaults() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(kMaxPumps));
  TEST_ASSERT_EQUAL_UINT32(static_cast<uint32_t>(kDefaultAntiDripMs), store.antiDripMs(kMaxPumps));
  TEST_ASSERT_FALSE(store.bound(kMaxPumps));
  TEST_ASSERT_EQUAL_STRING("", store.ingredient(kMaxPumps));
}

void test_version_mismatch_resets_to_defaults() {
  resetBacking();
  ConfigRecord stale;
  stale.version = kConfigSchemaVersion + 1;
  stale.pumps[0].ml_per_s = 9.9f;  // distinctive, must NOT be loaded
  g_backing.storeRecord(stale);

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
  TEST_ASSERT_TRUE(store.dirty());  // reset record queued for re-persist
}

void test_magic_mismatch_resets_to_defaults() {
  resetBacking();
  ConfigRecord foreign;
  foreign.magic = 0xDEADBEEF;
  foreign.pumps[0].ml_per_s = 9.9f;
  g_backing.storeRecord(foreign);

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
  TEST_ASSERT_TRUE(store.dirty());
}

void test_num_pumps_mismatch_resets_to_defaults() {
  resetBacking();
  ConfigRecord resized;
  resized.num_pumps = kMaxPumps - 1;  // record written by a smaller build
  resized.pumps[0].ml_per_s = 9.9f;
  g_backing.storeRecord(resized);

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
}

void test_wrong_size_blob_treated_as_absent() {
  resetBacking();
  g_backing.blob.assign(4, 0xAB);  // junk shorter than sizeof(ConfigRecord)
  g_backing.has = true;

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
  TEST_ASSERT_TRUE(store.dirty());
}

void test_crc_mismatch_resets_to_defaults() {
  resetBacking();
  ConfigRecord bad = makeValidRecord();
  bad.pumps[0].ml_per_s = 9.9f;
  bad.crc32 = 0x12345678U;  // wrong CRC for the payload
  g_backing.storeRecord(bad);

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
  TEST_ASSERT_TRUE(store.dirty());
}

void test_null_ops_falls_back_to_defaults() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = NvsOps{nullptr, nullptr, nullptr, nullptr};
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
  // commit() must not crash when the seam is null; it simply fails.
  TEST_ASSERT_FALSE(store.commit());
}

void test_begin_open_failure_falls_back_to_defaults() {
  resetBacking();
  g_backing.begin_result = false;  // NVS namespace failed to open
  ConfigRecord stored;
  stored.pumps[0].ml_per_s = 9.9f;
  g_backing.storeRecord(stored);

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
}

void test_load_sanitizes_negative_ml_per_s() {
  resetBacking();
  ConfigRecord corrupt = makeValidRecord();
  corrupt.pumps[0].ml_per_s = -1.0f;
  corrupt.crc32 = testRecordCrc(corrupt);
  g_backing.storeRecord(corrupt);

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultMlPerSecond, store.mlPerSecond(0));
  TEST_ASSERT_TRUE(store.dirty());
}

void test_load_sanitizes_huge_anti_drip() {
  resetBacking();
  ConfigRecord corrupt = makeValidRecord();
  corrupt.pumps[0].anti_drip_ms = UINT32_MAX;
  corrupt.crc32 = testRecordCrc(corrupt);
  g_backing.storeRecord(corrupt);

  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);
  TEST_ASSERT_EQUAL_UINT32(static_cast<uint32_t>(kDefaultAntiDripMs), store.antiDripMs(0));
  TEST_ASSERT_TRUE(store.dirty());
}

void test_duplicate_binding_rejected() {
  resetBacking();
  ConfigStore store;
  NvsOps ops = makeNvsOps();
  store.begin(ops);

  TEST_ASSERT_TRUE(store.setBinding(0, "bourbon"));
  TEST_ASSERT_FALSE(store.setBinding(1, "bourbon"));
  TEST_ASSERT_EQUAL_INT(0, store.channelForIngredient("bourbon"));
}

bool failSetBlob(const char*, const void*, std::size_t) {
  return false;
}

void test_commit_failure_keeps_dirty() {
  resetBacking();
  const NvsOps ops = {fakeBegin, fakeGetBlob, failSetBlob, fakeCommit};
  ConfigStore store;
  store.begin(ops);
  TEST_ASSERT_TRUE(store.setCalibration(0, 2.0f, 100));
  TEST_ASSERT_TRUE(store.dirty());
  TEST_ASSERT_FALSE(store.commit());
  TEST_ASSERT_TRUE(store.dirty());
  TEST_ASSERT_EQUAL_FLOAT(2.0f, store.mlPerSecond(0));
}

}  // namespace

void setUp() {
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_defaults_when_no_record);
  RUN_TEST(test_set_calibration_roundtrip_via_commit);
  RUN_TEST(test_set_calibration_rejects_bad_values);
  RUN_TEST(test_set_calibration_bad_channel);
  RUN_TEST(test_binding_set_lookup_clear);
  RUN_TEST(test_binding_rejects_empty_and_too_long);
  RUN_TEST(test_out_of_range_accessors_return_defaults);
  RUN_TEST(test_version_mismatch_resets_to_defaults);
  RUN_TEST(test_magic_mismatch_resets_to_defaults);
  RUN_TEST(test_num_pumps_mismatch_resets_to_defaults);
  RUN_TEST(test_wrong_size_blob_treated_as_absent);
  RUN_TEST(test_crc_mismatch_resets_to_defaults);
  RUN_TEST(test_null_ops_falls_back_to_defaults);
  RUN_TEST(test_begin_open_failure_falls_back_to_defaults);
  RUN_TEST(test_load_sanitizes_negative_ml_per_s);
  RUN_TEST(test_load_sanitizes_huge_anti_drip);
  RUN_TEST(test_duplicate_binding_rejected);
  RUN_TEST(test_commit_failure_keeps_dirty);
  return UNITY_END();
}
