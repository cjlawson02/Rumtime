#include <unity.h>

#include "command_queue.h"
#include "status_snapshot.h"
#include "wifi_link_safety.h"

void setUp() {}
void tearDown() {}

void test_idle_wifi_loss_does_not_cancel() {
  CommandQueue queue;
  StatusSnapshot s;
  TEST_ASSERT_FALSE(cancelOnWifiLost(queue, true, false, s));
  TEST_ASSERT_FALSE(queue.drainCancel(false));
}

void test_busy_wifi_loss_enqueues_cancel() {
  CommandQueue queue;
  StatusSnapshot s;
  s.job_busy = true;
  TEST_ASSERT_TRUE(cancelOnWifiLost(queue, true, false, s));
  TEST_ASSERT_TRUE(queue.drainCancel(true));
}

void test_pumps_running_wifi_loss_enqueues_cancel() {
  CommandQueue queue;
  StatusSnapshot s;
  s.pumps_running = true;
  TEST_ASSERT_TRUE(shouldCancelOnWifiLost(true, false, s));
  TEST_ASSERT_TRUE(cancelOnWifiLost(queue, true, false, s));
  TEST_ASSERT_TRUE(queue.drainCancel(true));
}

void test_still_connected_does_not_cancel() {
  CommandQueue queue;
  StatusSnapshot s;
  s.job_busy = true;
  TEST_ASSERT_FALSE(cancelOnWifiLost(queue, true, true, s));
  TEST_ASSERT_FALSE(queue.drainCancel(true));
}

void test_never_connected_does_not_cancel() {
  CommandQueue queue;
  StatusSnapshot s;
  s.job_busy = true;
  TEST_ASSERT_FALSE(cancelOnWifiLost(queue, false, false, s));
  TEST_ASSERT_FALSE(queue.drainCancel(true));
}

void test_sequence_busy_wifi_loss_enqueues_cancel() {
  CommandQueue queue;
  StatusSnapshot s;
  s.sequence_busy = true;
  TEST_ASSERT_TRUE(cancelOnWifiLost(queue, true, false, s));
  TEST_ASSERT_TRUE(queue.drainCancel(true));
}

void test_heartbeat_timeout_cancels_when_armed_and_busy() {
  CommandQueue queue;
  TEST_ASSERT_TRUE(cancelOnHeartbeatTimeout(queue, true, true, 5000, 1000, 3000));
  TEST_ASSERT_TRUE(queue.drainCancel(true));
}

void test_heartbeat_fresh_activity_does_not_cancel() {
  CommandQueue queue;
  TEST_ASSERT_FALSE(cancelOnHeartbeatTimeout(queue, true, true, 2000, 1000, 3000));
  TEST_ASSERT_FALSE(queue.drainCancel(true));
}

void test_heartbeat_unarmed_does_not_cancel() {
  CommandQueue queue;
  TEST_ASSERT_FALSE(cancelOnHeartbeatTimeout(queue, false, true, 5000, 1000, 3000));
  TEST_ASSERT_FALSE(queue.drainCancel(true));
}

void test_heartbeat_idle_does_not_cancel() {
  CommandQueue queue;
  TEST_ASSERT_FALSE(cancelOnHeartbeatTimeout(queue, true, false, 5000, 1000, 3000));
  TEST_ASSERT_FALSE(queue.drainCancel(false));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_idle_wifi_loss_does_not_cancel);
  RUN_TEST(test_busy_wifi_loss_enqueues_cancel);
  RUN_TEST(test_pumps_running_wifi_loss_enqueues_cancel);
  RUN_TEST(test_still_connected_does_not_cancel);
  RUN_TEST(test_never_connected_does_not_cancel);
  RUN_TEST(test_sequence_busy_wifi_loss_enqueues_cancel);
  RUN_TEST(test_heartbeat_timeout_cancels_when_armed_and_busy);
  RUN_TEST(test_heartbeat_fresh_activity_does_not_cancel);
  RUN_TEST(test_heartbeat_unarmed_does_not_cancel);
  RUN_TEST(test_heartbeat_idle_does_not_cancel);
  return UNITY_END();
}
