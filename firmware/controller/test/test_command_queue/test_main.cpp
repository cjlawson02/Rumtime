#include <unity.h>

#include <cstring>

#include "command_queue.h"

namespace {

struct FakeQueueBackend {
  bool has_item = false;
  Command item{};
};

FakeQueueBackend g_backend;

void* fakeCreate(std::size_t item_size) {
  (void)item_size;
  g_backend = FakeQueueBackend{};
  return &g_backend;
}

void fakeDestroy(void* handle) {
  (void)handle;
}

bool fakeSend(void* handle, const void* item, std::size_t item_size) {
  auto* backend = static_cast<FakeQueueBackend*>(handle);
  if (backend->has_item) {
    return false;
  }
  std::memcpy(&backend->item, item, item_size);
  backend->has_item = true;
  return true;
}

bool fakeReceive(void* handle, void* out, std::size_t item_size) {
  auto* backend = static_cast<FakeQueueBackend*>(handle);
  if (!backend->has_item) {
    return false;
  }
  std::memcpy(out, &backend->item, item_size);
  backend->has_item = false;
  return true;
}

void fakeReset(void* handle) {
  auto* backend = static_cast<FakeQueueBackend*>(handle);
  backend->has_item = false;
}

unsigned fakePending(void* handle) {
  const auto* backend = static_cast<const FakeQueueBackend*>(handle);
  return backend->has_item ? 1U : 0U;
}

const QueueOps kFakeQueueOps = {
    fakeCreate,
    fakeDestroy,
    fakeSend,
    fakeReceive,
    fakeReset,
    fakePending,
};

}  // namespace

void test_enqueue_dispense_then_drain() {
  CommandQueue queue;
  TEST_ASSERT_TRUE(queue.begin(kFakeQueueOps));

  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = 30.0f;
  cmd.ml_per_s = 1.75f;
  cmd.anti_drip_ms = 100;
  TEST_ASSERT_TRUE(queue.enqueueDispense(cmd));
  TEST_ASSERT_TRUE(queue.hasPending());

  Command out;
  TEST_ASSERT_TRUE(queue.drainCommand(out));
  TEST_ASSERT_EQUAL(static_cast<int>(CommandType::kDispensePump), static_cast<int>(out.type));
  TEST_ASSERT_FALSE(queue.hasPending());
}

void test_dispense_then_cancel_flushes_queue() {
  CommandQueue queue;
  TEST_ASSERT_TRUE(queue.begin(kFakeQueueOps));

  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = 30.0f;
  TEST_ASSERT_TRUE(queue.enqueueDispense(cmd));
  queue.enqueueCancel();

  TEST_ASSERT_TRUE(queue.drainCancel());
  TEST_ASSERT_FALSE(queue.hasPending());

  Command out;
  TEST_ASSERT_FALSE(queue.drainCommand(out));
}

void test_cancel_then_dispense_preserves_queue() {
  CommandQueue queue;
  TEST_ASSERT_TRUE(queue.begin(kFakeQueueOps));

  queue.enqueueCancel();
  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = 30.0f;
  TEST_ASSERT_TRUE(queue.enqueueDispense(cmd));
  queue.markDispenseAfterCancel();

  TEST_ASSERT_TRUE(queue.drainCancel());
  TEST_ASSERT_TRUE(queue.hasPending());

  Command out;
  TEST_ASSERT_TRUE(queue.drainCommand(out));
  TEST_ASSERT_EQUAL(30.0f, out.dispense.ml);
}

void test_duplicate_enqueue_busy() {
  CommandQueue queue;
  TEST_ASSERT_TRUE(queue.begin(kFakeQueueOps));

  DispenseCommand cmd;
  cmd.channel = 0;
  cmd.ml = 10.0f;
  TEST_ASSERT_TRUE(queue.enqueueDispense(cmd));
  TEST_ASSERT_FALSE(queue.enqueueDispense(cmd));
}

void test_cancel_without_dispense() {
  CommandQueue queue;
  TEST_ASSERT_TRUE(queue.begin(kFakeQueueOps));
  queue.enqueueCancel();
  TEST_ASSERT_TRUE(queue.drainCancel());
  TEST_ASSERT_FALSE(queue.hasPending());
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_enqueue_dispense_then_drain);
  RUN_TEST(test_dispense_then_cancel_flushes_queue);
  RUN_TEST(test_cancel_then_dispense_preserves_queue);
  RUN_TEST(test_duplicate_enqueue_busy);
  RUN_TEST(test_cancel_without_dispense);
  return UNITY_END();
}
