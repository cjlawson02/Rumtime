#include <unity.h>

#include <cstring>
#include <unordered_map>
#include <vector>

#include "config.h"
#include "config_store.h"
#include "crc32.h"
#include "inventory_store.h"

namespace {

struct FakeNvsState {
  std::unordered_map<std::string, std::vector<unsigned char>> blobs;
  bool open = false;
  bool reject_reopen = true;
};

FakeNvsState g_state;

bool fakeBegin(const char*) {
  if (g_state.reject_reopen && g_state.open) {
    return false;
  }
  g_state.open = true;
  return true;
}

bool idempotentBegin(const char* ns) {
  g_state.open = false;
  return fakeBegin(ns);
}

bool fakeGetBlob(const char* key, void* out, std::size_t len) {
  const auto it = g_state.blobs.find(key);
  if (it == g_state.blobs.end() || it->second.size() != len) {
    return false;
  }
  std::memcpy(out, it->second.data(), len);
  return true;
}

bool fakeSetBlob(const char* key, const void* data, std::size_t len) {
  const auto* bytes = static_cast<const unsigned char*>(data);
  g_state.blobs[key].assign(bytes, bytes + len);
  return true;
}

void resetState() {
  g_state = FakeNvsState{};
}

void test_both_dirty_commit_fails_when_begin_cannot_reopen() {
  resetState();
  const NvsOps ops = {fakeBegin, fakeGetBlob, fakeSetBlob};

  ConfigStore config;
  InventoryStore inventory;
  config.begin(ops);
  inventory.begin(ops);

  TEST_ASSERT_TRUE(config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(inventory.seedOnBinding("bourbon"));
  TEST_ASSERT_TRUE(inventory.setPrimed("bourbon", true));
  TEST_ASSERT_TRUE(config.dirty());
  TEST_ASSERT_TRUE(inventory.dirty());

  TEST_ASSERT_FALSE(commitMachineStores(config, inventory));
  TEST_ASSERT_TRUE(config.dirty());
  TEST_ASSERT_TRUE(inventory.dirty());
}

void test_both_dirty_commit_succeeds_with_idempotent_begin() {
  resetState();
  const NvsOps ops = {idempotentBegin, fakeGetBlob, fakeSetBlob};

  ConfigStore config;
  InventoryStore inventory;
  config.begin(ops);
  inventory.begin(ops);

  TEST_ASSERT_TRUE(config.setBinding(0, "bourbon"));
  TEST_ASSERT_TRUE(inventory.seedOnBinding("bourbon"));
  TEST_ASSERT_TRUE(inventory.setPrimed("bourbon", true));

  TEST_ASSERT_TRUE(commitMachineStores(config, inventory));
  TEST_ASSERT_FALSE(config.dirty());
  TEST_ASSERT_FALSE(inventory.dirty());
  TEST_ASSERT_TRUE(g_state.blobs.count(kConfigBlobKey) == 1);
  TEST_ASSERT_TRUE(g_state.blobs.count(kInventoryBlobKey) == 1);
}

void test_single_store_commit_opens_namespace_before_write() {
  resetState();
  InventoryRecord inv{};
  inv.crc32 = crc32OfRecord(inv);
  g_state.blobs[kInventoryBlobKey].assign(reinterpret_cast<unsigned char*>(&inv),
                                          reinterpret_cast<unsigned char*>(&inv) + sizeof(inv));

  const NvsOps ops = {idempotentBegin, fakeGetBlob, fakeSetBlob};

  ConfigStore config;
  InventoryStore inventory;
  config.begin(ops);
  inventory.begin(ops);

  TEST_ASSERT_TRUE(config.setCalibration(0, 2.0f, 100));
  TEST_ASSERT_FALSE(inventory.dirty());

  TEST_ASSERT_TRUE(commitMachineStores(config, inventory));
  TEST_ASSERT_FALSE(config.dirty());
}

}  // namespace

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_both_dirty_commit_fails_when_begin_cannot_reopen);
  RUN_TEST(test_both_dirty_commit_succeeds_with_idempotent_begin);
  RUN_TEST(test_single_store_commit_opens_namespace_before_write);
  return UNITY_END();
}
