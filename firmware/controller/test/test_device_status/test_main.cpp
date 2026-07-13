#include <unity.h>

#include <cstring>
#include <string>

#include "command_validate.h"
#include "config.h"
#include "config_op_queue.h"
#include "config_store.h"
#include "device_status.h"
#include "http_validate.h"
#include "inventory_store.h"
#include "queue_ops.h"
#include "status_snapshot.h"

namespace {

constexpr uint8_t kNumPumps = 2;

bool nvsBegin(const char*) {
  return true;
}
bool nvsGetBlob(const char*, void*, std::size_t) {
  return false;
}
bool nvsSetBlob(const char*, const void*, std::size_t) {
  return true;
}

ConfigStore g_config;
InventoryStore g_inventory;
const NvsOps kTestNvsOps = {nvsBegin, nvsGetBlob, nvsSetBlob};

ConfigOp g_queue_slot;
bool g_queue_has_item = false;

void* fakeQueueCreate(std::size_t) {
  return reinterpret_cast<void*>(1);
}
void fakeQueueDestroy(void*) {
}
bool fakeQueueSend(void*, const void* item, std::size_t len) {
  if (g_queue_has_item) {
    return false;
  }
  std::memcpy(&g_queue_slot, item, len);
  g_queue_has_item = true;
  return true;
}
bool fakeQueueReceive(void*, void* out, std::size_t len) {
  if (!g_queue_has_item) {
    return false;
  }
  std::memcpy(out, &g_queue_slot, len);
  g_queue_has_item = false;
  return true;
}
void fakeQueueReset(void*) {
  g_queue_has_item = false;
}
unsigned fakeQueuePending(void*) {
  return g_queue_has_item ? 1U : 0U;
}

const QueueOps kFakeQueueOps = {fakeQueueCreate,  fakeQueueDestroy, fakeQueueSend,
                                fakeQueueReceive, fakeQueueReset,   fakeQueuePending};

ConfigOpQueue g_config_queue;

void resetStores() {
  g_config.begin(kTestNvsOps);
  g_inventory.begin(kTestNvsOps);
  g_queue_has_item = false;
  g_config_queue.begin(kFakeQueueOps);
}

bool jsonContains(const std::string& json, const char* needle) {
  return json.find(needle) != std::string::npos;
}

void test_device_status_idle_null_jobs() {
  StatusSnapshot snap;
  snap.scale_ready = true;
  DeviceStatusInputs in;
  in.wifi_connected = true;
  in.wifi_ssid = "IoT";
  in.wifi_ip = "192.168.5.29";
  in.wifi_rssi = -61;
  in.wifi_last_disconnect_reason = 8;
  in.uptime_ms = 3725000;
  in.free_heap = 204800;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"job\":null"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"pumpJob\":null"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"connected\":true"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"ssid\":\"IoT\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"ip\":\"192.168.5.29\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"rssi\":-61"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"lastDisconnectReason\":8"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"uptimeSeconds\":3725"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"freeHeap\":204800"));
}

void test_device_status_sequence_pouring() {
  StatusSnapshot snap;
  snap.sequence_busy = true;
  snap.sequence_step_index = 1;
  snap.sequence_step_count = 2;
  snap.sequence_step_progress = 0;
  snap.sequence_progress = 50;
  std::strncpy(snap.sequence_ingredient, "bourbon", kIngredientIdMax - 1);
  std::strncpy(snap.active_recipe_id, "old-fashioned", kRecipeIdMax - 1);

  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"state\":\"pouring\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"recipeId\":\"old-fashioned\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"progress\":50"));
}

void test_device_status_sequence_includes_step_progress() {
  StatusSnapshot snap;
  snap.sequence_busy = true;
  snap.sequence_step_index = 0;
  snap.sequence_step_count = 2;
  snap.sequence_step_progress = 50;
  // Duration-weighted overall (e.g. long first step half done).
  snap.sequence_progress = 40;
  std::strncpy(snap.sequence_ingredient, "bourbon", kIngredientIdMax - 1);
  std::strncpy(snap.active_recipe_id, "old-fashioned", kRecipeIdMax - 1);

  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"progress\":40"));
}

void test_device_status_job_terminal_flow_timeout_message() {
  StatusSnapshot snap;
  snap.job_terminal = JobTerminalState::kError;
  snap.job_reject = JobReject::kFlowTimeout;
  std::strncpy(snap.terminal_recipe_id, "old-fashioned", kRecipeIdMax - 1);
  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"state\":\"error\""));
  TEST_ASSERT_TRUE(jsonContains(json, "No flow detected"));
}

void test_device_status_prime_pump_job() {
  StatusSnapshot snap;
  snap.job_busy = true;
  snap.pump_job_pump_id = 1;
  snap.pump_job_purpose = static_cast<uint8_t>(PumpJobPurposeWire::kPrime);
  snap.pump_job_start_ms = 1000;
  DeviceStatusInputs in;
  in.snapshot = &snap;
  in.now_ms = 13000;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"purpose\":\"prime\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"continuous\":true"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"elapsedSeconds\":12"));
}

void test_device_status_verify_pump_job() {
  StatusSnapshot snap;
  snap.job_busy = true;
  snap.pump_job_pump_id = 1;
  snap.pump_job_purpose = static_cast<uint8_t>(PumpJobPurposeWire::kVerify);
  snap.pump_job_start_ms = 1000;
  snap.pump_job_target_ml = 30.0f;
  snap.pump_job_duration_ms = 17143;
  DeviceStatusInputs in;
  in.snapshot = &snap;
  in.now_ms = 3000;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"purpose\":\"verify\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"state\":\"running\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"targetMl\":30"));
}

void test_device_status_job_terminal_complete() {
  StatusSnapshot snap;
  snap.job_terminal = JobTerminalState::kComplete;
  std::strncpy(snap.terminal_recipe_id, "daiquiri", kRecipeIdMax - 1);
  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"state\":\"complete\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"recipeId\":\"daiquiri\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"pumpJob\":null"));
}

void test_device_status_job_terminal_error() {
  StatusSnapshot snap;
  snap.job_terminal = JobTerminalState::kError;
  std::strncpy(snap.terminal_recipe_id, "old-fashioned", kRecipeIdMax - 1);
  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"state\":\"error\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"stepLabel\":\"Pour failed\""));
  TEST_ASSERT_TRUE(jsonContains(json, "\"recipeId\":\"old-fashioned\""));
}

void test_device_status_published_bindings() {
  StatusSnapshot snap;
  snap.published_binding_count = 1;
  std::strncpy(snap.published_bindings[0].ingredient_id, "bourbon", kIngredientIdMax - 1);
  snap.published_bindings[0].remaining_ml = 420.0f;
  snap.published_bindings[0].bottle_size_ml = 750.0f;
  snap.published_bindings[0].primed = true;
  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"bourbon\":{"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"remainingMl\":420"));
  TEST_ASSERT_TRUE(jsonContains(json, "\"primed\":true"));
}

void test_device_status_notifications_scale_not_ready() {
  StatusSnapshot snap;
  snap.scale_ready = false;
  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"id\":\"scale_not_ready\""));
}

void test_device_status_config_op_apply_failed_notification() {
  StatusSnapshot snap;
  snap.config_op_apply_failed = true;
  DeviceStatusInputs in;
  in.snapshot = &snap;
  const std::string json = buildDeviceStatusJson(in);
  TEST_ASSERT_TRUE(jsonContains(json, "\"id\":\"config_op_failed\""));
}

void test_config_op_queue_enqueue_drain() {
  ConfigOp op = {};
  op.type = ConfigOpType::kInventoryPrimed;
  std::strncpy(op.ingredient_id, "bourbon", kIngredientIdMax - 1);
  op.inventory_bool = true;
  TEST_ASSERT_TRUE(g_config_queue.enqueue(op));
  TEST_ASSERT_FALSE(g_config_queue.enqueue(op));
  ConfigOp pending;
  TEST_ASSERT_TRUE(g_config_queue.drain(pending));
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpType::kInventoryPrimed),
                    static_cast<int>(pending.type));
}

void test_apply_binding_seeds_inventory() {
  ConfigOp op = {};
  op.type = ConfigOpType::kSetBinding;
  op.channel = 0;
  std::strncpy(op.ingredient_id, "bourbon", kIngredientIdMax - 1);
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpReject::kNone),
                    static_cast<int>(applyConfigOp(op, g_config, g_inventory)));
  const InventoryEntry* entry = g_inventory.find("bourbon");
  TEST_ASSERT_NOT_NULL(entry);
  TEST_ASSERT_FALSE(entry->primed);
  TEST_ASSERT_EQUAL_FLOAT(kDefaultBottleSizeMl, entry->remaining_ml);
}

void test_preflight_calibration_zero_rejects() {
  ConfigOp op = {};
  op.type = ConfigOpType::kSetCalibration;
  op.channel = 0;
  op.ml_per_s = 0.0f;
  op.has_anti_drip = true;
  op.anti_drip_ms = 100;
  StatusSnapshot status;
  const ConfigOpReject reject = preflightConfigOpEnqueue(op, status, kNumPumps);
  TEST_ASSERT_EQUAL(static_cast<int>(ConfigOpReject::kBadCalibration), static_cast<int>(reject));
  TEST_ASSERT_EQUAL(422, static_cast<int>(httpStatusForConfigReject(reject)));
}

void test_http_status_codes() {
  TEST_ASSERT_EQUAL(409, static_cast<int>(httpStatusForReject(CommandReject::kBusy)));
  TEST_ASSERT_EQUAL(422, static_cast<int>(httpStatusForReject(CommandReject::kNotPrimed)));
}

}  // namespace

void setUp() {
  resetStores();
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_device_status_idle_null_jobs);
  RUN_TEST(test_device_status_sequence_pouring);
  RUN_TEST(test_device_status_sequence_includes_step_progress);
  RUN_TEST(test_device_status_prime_pump_job);
  RUN_TEST(test_device_status_verify_pump_job);
  RUN_TEST(test_device_status_job_terminal_complete);
  RUN_TEST(test_device_status_job_terminal_error);
  RUN_TEST(test_device_status_job_terminal_flow_timeout_message);
  RUN_TEST(test_device_status_published_bindings);
  RUN_TEST(test_device_status_notifications_scale_not_ready);
  RUN_TEST(test_device_status_config_op_apply_failed_notification);
  RUN_TEST(test_config_op_queue_enqueue_drain);
  RUN_TEST(test_apply_binding_seeds_inventory);
  RUN_TEST(test_preflight_calibration_zero_rejects);
  RUN_TEST(test_http_status_codes);
  return UNITY_END();
}
