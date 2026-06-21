#pragma once

#include <Arduino.h>

class ScaleDriver;

enum class PumpId : uint8_t { kPump1 = 0, kPump2 = 1 };

enum class PumpDirection { kStop, kForward, kReverse };

struct GatedDispenseResult {
  bool ok = false;
  unsigned long gated_delay_ms = 0;
  unsigned long timed_ms = 0;
  float mass_delta_g = 0.0f;
};

class PumpDriver {
 public:
  void begin(int in1, int in2, int pwm);

  void setDirection(PumpDirection direction);
  void setPwm(int duty);  // 0–255

  PumpDirection direction() const { return direction_; }
  int pwm() const { return pwm_duty_; }

 private:
  int in1_ = -1;
  int in2_ = -1;
  int pwm_pin_ = -1;
  int pwm_duty_ = 0;
  PumpDirection direction_ = PumpDirection::kStop;
};

class BenchRig {
 public:
  void begin();

  void runPump(PumpId pump, PumpDirection direction, int pwm = 255);
  void stopPump(PumpId pump);
  void stopAll();

  void dispenseMl(PumpId pump, float ml, float mlPerSecond,
                  unsigned long antiDripMs);
  GatedDispenseResult dispenseMlGated(PumpId pump, float ml, float mlPerSecond,
                                      unsigned long antiDripMs,
                                      ScaleDriver& scale);
  void prime(PumpId pump, unsigned long durationMs);

  bool busy() const { return busy_; }

 private:
  PumpDriver pumps_[2];
  bool busy_ = false;

  PumpDriver& driver(PumpId pump);
  void runFor(PumpId pump, PumpDirection direction, unsigned long durationMs,
              int pwm = 255);
};
