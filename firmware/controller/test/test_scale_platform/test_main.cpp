#include <unity.h>

#include <cstddef>
#include <vector>

#include "config.h"
#include "scale_ops.h"
#include "scale_platform.h"

namespace {

// Feeds scripted gram / raw sequences to ScalePlatform without any HX711 I/O.
class FakeScale {
 public:
  std::vector<float> grams;
  std::vector<long> raws;
  std::size_t grams_idx = 0;
  std::size_t raws_idx = 0;

  bool wait_ready_result = true;
  bool is_ready_result = true;

  float scale_factor = 0.0f;
  long offset = 0;
  bool offset_set = false;
  int begin_calls = 0;

  float nextGrams() {
    if (grams.empty()) {
      return 0.0f;
    }
    const std::size_t i = grams_idx < grams.size() ? grams_idx : grams.size() - 1;
    ++grams_idx;
    return grams[i];
  }

  long nextRaw() {
    if (raws.empty()) {
      return 0;
    }
    const std::size_t i = raws_idx < raws.size() ? raws_idx : raws.size() - 1;
    ++raws_idx;
    return raws[i];
  }
};

FakeScale* g_fake = nullptr;

void fakeBegin(int, int) {
  ++g_fake->begin_calls;
}
bool fakeWaitReady(unsigned long) {
  return g_fake->wait_ready_result;
}
bool fakeIsReady() {
  return g_fake->is_ready_result;
}
float fakeGetUnits() {
  return g_fake->nextGrams();
}
long fakeReadRaw() {
  return g_fake->nextRaw();
}
void fakeSetScale(float factor) {
  g_fake->scale_factor = factor;
}
void fakeSetOffset(long offset) {
  g_fake->offset = offset;
  g_fake->offset_set = true;
}

ScaleOps makeOps() {
  return ScaleOps{
      fakeBegin, fakeWaitReady, fakeIsReady, fakeGetUnits, fakeReadRaw, fakeSetScale, fakeSetOffset,
  };
}

void test_rolling_filter_average() {
  FakeScale fake;
  g_fake = &fake;
  fake.grams = {10.0f, 20.0f, 30.0f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);

  scale.tick(0);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 10.0f, scale.readFilteredGrams());
  scale.tick(1);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 15.0f, scale.readFilteredGrams());
  scale.tick(2);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 20.0f, scale.readFilteredGrams());
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 30.0f, scale.readGrams());
}

void test_flow_gate_consecutive_threshold() {
  FakeScale fake;
  g_fake = &fake;
  // Baseline, then three deltas above the 0.03 g threshold in a row.
  fake.grams = {100.0f, 100.1f, 100.2f, 100.3f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  scale.resetFlowDetect(0);

  scale.tick(0);  // baseline sample, no delta
  TEST_ASSERT_FALSE(scale.flowDetected());
  scale.tick(1);  // consecutive 1
  TEST_ASSERT_FALSE(scale.flowDetected());
  scale.tick(2);  // consecutive 2
  TEST_ASSERT_FALSE(scale.flowDetected());
  scale.tick(3);  // consecutive 3 -> detected
  TEST_ASSERT_TRUE(scale.flowDetected());
  TEST_ASSERT_FALSE(scale.flowTimedOut());
}

void test_flow_below_threshold_does_not_detect() {
  FakeScale fake;
  g_fake = &fake;
  // Deltas of 0.01 g stay under the 0.03 g threshold.
  fake.grams = {100.0f, 100.01f, 100.02f, 100.03f, 100.04f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  scale.resetFlowDetect(0);

  for (int i = 0; i < 5; ++i) {
    scale.tick(static_cast<unsigned long>(i));
  }
  TEST_ASSERT_FALSE(scale.flowDetected());
}

void test_flow_timeout_elapsed_without_blocking() {
  FakeScale fake;
  g_fake = &fake;
  fake.grams = {50.0f};  // flat weight, no flow
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  scale.resetFlowDetect(0);

  scale.tick(100);
  TEST_ASSERT_FALSE(scale.flowTimedOut());
  scale.tick(1000);
  TEST_ASSERT_FALSE(scale.flowTimedOut());
  scale.tick(scale.flowDetectTimeoutMs() + 1);  // past the timeout window
  TEST_ASSERT_TRUE(scale.flowTimedOut());
  TEST_ASSERT_FALSE(scale.flowDetected());
}

void test_tare_completes_over_multiple_ticks() {
  FakeScale fake;
  g_fake = &fake;
  fake.raws = {300, 300, 300};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);

  scale.tare();
  TEST_ASSERT_TRUE(scale.taring());

  for (uint8_t i = 0; i + 1 < kScaleFilterReads; ++i) {
    scale.tick(static_cast<unsigned long>(i));
    TEST_ASSERT_TRUE(scale.taring());
    TEST_ASSERT_FALSE(fake.offset_set);
  }
  scale.tick(kScaleFilterReads);  // final tare sample sets the offset
  TEST_ASSERT_FALSE(scale.taring());
  TEST_ASSERT_TRUE(fake.offset_set);
  TEST_ASSERT_EQUAL_INT32(300, fake.offset);
}

void test_ready_false_when_backend_fails() {
  FakeScale fake;
  g_fake = &fake;
  fake.wait_ready_result = false;
  fake.grams = {42.0f, 42.0f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);

  TEST_ASSERT_FALSE(scale.ready());
  scale.tick(0);  // no-op: no conversion attempted when not ready
  TEST_ASSERT_EQUAL_UINT(0, fake.grams_idx);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, scale.readFilteredGrams());
}

void test_not_ready_backend_skips_conversion() {
  FakeScale fake;
  g_fake = &fake;
  fake.is_ready_result = false;
  fake.grams = {7.0f, 7.0f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);

  scale.tick(0);  // ready() true but backend not ready -> no sample consumed
  TEST_ASSERT_EQUAL_UINT(0, fake.grams_idx);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 0.0f, scale.readFilteredGrams());
}

void test_flow_timeout_fires_when_backend_not_ready() {
  FakeScale fake;
  g_fake = &fake;
  fake.is_ready_result = false;  // never converts, so a dead HX711 must still abort a pour.
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  scale.resetFlowDetect(0);

  scale.tick(scale.flowDetectTimeoutMs() + 1);
  TEST_ASSERT_TRUE(scale.flowTimedOut());
  TEST_ASSERT_FALSE(scale.flowDetected());
  TEST_ASSERT_EQUAL_UINT(0, fake.grams_idx);
}

void test_flow_timeout_then_no_late_detect() {
  FakeScale fake;
  g_fake = &fake;
  // Baseline, then three deltas above threshold that must NOT re-arm detection
  // once the timeout has already latched.
  fake.grams = {100.0f, 100.1f, 100.2f, 100.3f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  scale.resetFlowDetect(0);

  scale.tick(scale.flowDetectTimeoutMs() + 1000);  // baseline sample, timeout fires first
  TEST_ASSERT_TRUE(scale.flowTimedOut());
  TEST_ASSERT_FALSE(scale.flowDetected());

  scale.tick(scale.flowDetectTimeoutMs() + 1001);
  scale.tick(scale.flowDetectTimeoutMs() + 1002);
  scale.tick(scale.flowDetectTimeoutMs() + 1003);
  TEST_ASSERT_FALSE(scale.flowDetected());
  TEST_ASSERT_TRUE(scale.flowTimedOut());
}

void test_flow_detected_then_no_late_timeout() {
  FakeScale fake;
  g_fake = &fake;
  fake.grams = {100.0f, 100.1f, 100.2f, 100.3f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  scale.resetFlowDetect(0);

  scale.tick(0);
  scale.tick(1);
  scale.tick(2);
  scale.tick(3);  // consecutive 3 -> detected, disarms the gate
  TEST_ASSERT_TRUE(scale.flowDetected());

  scale.tick(scale.flowDetectTimeoutMs() + 1000);  // far past the timeout window
  TEST_ASSERT_FALSE(scale.flowTimedOut());
  TEST_ASSERT_TRUE(scale.flowDetected());
}

void test_filter_evicts_oldest() {
  FakeScale fake;
  g_fake = &fake;
  const int kSamples = kScaleFilterReads + 2;
  for (int i = 0; i < kSamples; ++i) {
    fake.grams.push_back(static_cast<float>(10 * (i + 1)));  // 10, 20, 30, ...
  }
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);

  for (int i = 0; i < kSamples; ++i) {
    scale.tick(static_cast<unsigned long>(i));
  }

  float expected_sum = 0.0f;
  for (int i = kSamples - kScaleFilterReads; i < kSamples; ++i) {
    expected_sum += fake.grams[static_cast<std::size_t>(i)];
  }
  const float expected = expected_sum / static_cast<float>(kScaleFilterReads);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, expected, scale.readFilteredGrams());
}

void test_stale_makes_ready_false_and_recovers() {
  FakeScale fake;
  g_fake = &fake;
  fake.wait_ready_result = true;
  fake.is_ready_result = false;  // no conversions yet
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);

  scale.tick(kScaleStaleTimeoutMs + 1);  // no conversion ever happened -> now stale
  TEST_ASSERT_FALSE(scale.ready());

  fake.is_ready_result = true;
  fake.grams = {55.0f, 55.0f};
  scale.tick(kScaleStaleTimeoutMs + 2);  // stale_ computed from the pre-conversion timestamp
  TEST_ASSERT_FALSE(scale.ready());

  scale.tick(kScaleStaleTimeoutMs + 3);  // next tick sees the recent conversion -> recovers
  TEST_ASSERT_TRUE(scale.ready());
}

void test_set_flow_config_clamps() {
  FakeScale fake;
  g_fake = &fake;
  fake.grams = {50.0f, 50.0f, 50.0f, 50.0f, 50.0f};
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  scale.setFlowConfig(-1.0f, 0, 5000);  // threshold clamps to 0, consecutive clamps to 1
  scale.resetFlowDetect(0);

  for (int i = 0; i < 5; ++i) {
    scale.tick(static_cast<unsigned long>(i));
  }
  TEST_ASSERT_FALSE(scale.flowDetected());
}

void test_set_calibration_factor_forwards_to_backend() {
  FakeScale fake;
  g_fake = &fake;
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  scale.begin(ops);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, kScaleCalibrationFactor, fake.scale_factor);

  scale.setCalibrationFactor(1234.5f);
  TEST_ASSERT_FLOAT_WITHIN(0.001f, 1234.5f, fake.scale_factor);
}

void test_set_calibration_before_begin_does_not_crash() {
  ScalePlatform scale;
  scale.setCalibrationFactor(1.0f);  // ops_ is still null; must not deref
  TEST_ASSERT_FALSE(scale.ready());
}

void test_null_ops_member_leaves_not_ready() {
  FakeScale fake;
  g_fake = &fake;
  ScalePlatform scale;
  ScaleOps ops = makeOps();
  ops.getUnits = nullptr;
  scale.begin(ops);
  TEST_ASSERT_FALSE(scale.ready());
  scale.tick(0);  // must not crash despite the null getUnits pointer
  TEST_ASSERT_FALSE(scale.ready());
}

}  // namespace

void setUp() {
}

void tearDown() {
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_rolling_filter_average);
  RUN_TEST(test_flow_gate_consecutive_threshold);
  RUN_TEST(test_flow_below_threshold_does_not_detect);
  RUN_TEST(test_flow_timeout_elapsed_without_blocking);
  RUN_TEST(test_tare_completes_over_multiple_ticks);
  RUN_TEST(test_ready_false_when_backend_fails);
  RUN_TEST(test_not_ready_backend_skips_conversion);
  RUN_TEST(test_flow_timeout_fires_when_backend_not_ready);
  RUN_TEST(test_flow_timeout_then_no_late_detect);
  RUN_TEST(test_flow_detected_then_no_late_timeout);
  RUN_TEST(test_filter_evicts_oldest);
  RUN_TEST(test_stale_makes_ready_false_and_recovers);
  RUN_TEST(test_set_flow_config_clamps);
  RUN_TEST(test_set_calibration_factor_forwards_to_backend);
  RUN_TEST(test_set_calibration_before_begin_does_not_crash);
  RUN_TEST(test_null_ops_member_leaves_not_ready);
  return UNITY_END();
}
