#include <unity.h>

#include "status_snapshot.h"

void test_publish_read_round_trip() {
  StatusPublisher pub;
  pub.begin();

  StatusSnapshot in;
  in.job_busy = true;
  in.grams = 12.34f;
  in.command_pending = true;
  pub.publish(in);

  const StatusSnapshot out = pub.read();
  TEST_ASSERT_TRUE(out.job_busy);
  TEST_ASSERT_TRUE(out.command_pending);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 12.34f, out.grams);
}

void test_seqlock_stable_reads() {
  StatusPublisher pub;
  pub.begin();

  StatusSnapshot writer_a;
  writer_a.job_busy = false;
  writer_a.grams = 1.0f;

  StatusSnapshot writer_b;
  writer_b.job_busy = true;
  writer_b.grams = 999.0f;

  for (int i = 0; i < 1000; ++i) {
    pub.publish((i & 1) ? writer_b : writer_a);
    const StatusSnapshot s = pub.read();
    if (s.job_busy) {
      TEST_ASSERT_FLOAT_WITHIN(0.001f, 999.0f, s.grams);
    } else {
      TEST_ASSERT_FLOAT_WITHIN(0.001f, 1.0f, s.grams);
    }
  }
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_publish_read_round_trip);
  RUN_TEST(test_seqlock_stable_reads);
  return UNITY_END();
}
