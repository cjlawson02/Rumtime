#include "pump_driver.h"

#include "config.h"
#include "scale_driver.h"

void PumpDriver::begin(int in1, int in2, int pwm_pin) {
  in1_ = in1;
  in2_ = in2;
  pwm_pin_ = pwm_pin;
  pinMode(in1_, OUTPUT);
  pinMode(in2_, OUTPUT);
  pinMode(pwm_pin_, OUTPUT);
  setDirection(PumpDirection::kStop);
  setPwm(0);
}

void PumpDriver::setDirection(PumpDirection direction) {
  direction_ = direction;
  switch (direction) {
    case PumpDirection::kForward:
      digitalWrite(in1_, HIGH);
      digitalWrite(in2_, LOW);
      break;
    case PumpDirection::kReverse:
      digitalWrite(in1_, LOW);
      digitalWrite(in2_, HIGH);
      break;
    case PumpDirection::kStop:
    default:
      digitalWrite(in1_, LOW);
      digitalWrite(in2_, LOW);
      break;
  }
}

void PumpDriver::setPwm(int duty) {
  pwm_duty_ = duty;
  analogWrite(pwm_pin_, duty);
}

PumpDriver& BenchRig::driver(PumpId pump) {
  return pumps_[static_cast<uint8_t>(pump)];
}

void BenchRig::begin() {
  pinMode(pins::kStandby, OUTPUT);
  digitalWrite(pins::kStandby, HIGH);

  pumps_[0].begin(pins::kPump1In1, pins::kPump1In2, pins::kPump1Pwm);
  pumps_[1].begin(pins::kPump2In1, pins::kPump2In2, pins::kPump2Pwm);
  stopAll();
}

void BenchRig::runPump(PumpId pump, PumpDirection direction, int pwm) {
  driver(pump).setPwm(pwm);
  driver(pump).setDirection(direction);
}

void BenchRig::stopPump(PumpId pump) {
  driver(pump).setDirection(PumpDirection::kStop);
  driver(pump).setPwm(0);
}

void BenchRig::stopAll() {
  stopPump(PumpId::kPump1);
  stopPump(PumpId::kPump2);
  busy_ = false;
}

void BenchRig::runFor(PumpId pump, PumpDirection direction,
                      unsigned long durationMs, int pwm) {
  runPump(pump, direction, pwm);
  delay(durationMs);
  stopPump(pump);
}

void BenchRig::dispenseMl(PumpId pump, float ml, float mlPerSecond,
                          unsigned long antiDripMs) {
  if (mlPerSecond <= 0.0f) {
    return;
  }

  busy_ = true;
  const unsigned long forwardMs =
      static_cast<unsigned long>((ml / mlPerSecond) * 1000.0f);

  runFor(pump, PumpDirection::kForward, forwardMs, kPumpPwmFull);
  delay(50);
  if (antiDripMs > 0) {
    runFor(pump, PumpDirection::kReverse, antiDripMs, kPumpPwmFull);
  }
  busy_ = false;
}

GatedDispenseResult BenchRig::dispenseMlGated(PumpId pump, float ml,
                                              float mlPerSecond,
                                              unsigned long antiDripMs,
                                              ScaleDriver& scale) {
  GatedDispenseResult result;
  if (mlPerSecond <= 0.0f) {
    return result;
  }

  busy_ = true;
  const float massBefore = scale.readGrams();
  const unsigned long pourMs =
      static_cast<unsigned long>((ml / mlPerSecond) * 1000.0f);
  result.timed_ms = pourMs;

  scale.resetFlowDetect();
  const unsigned long pumpStart = millis();
  runPump(pump, PumpDirection::kForward, kPumpPwmFull);

  bool flowOk = false;
  while (millis() - pumpStart < scale.flowDetectTimeoutMs()) {
    if (scale.isFlowDetected()) {
      result.gated_delay_ms = millis() - pumpStart;
      flowOk = true;
      break;
    }
    delay(kFlowSampleIntervalMs);
  }

  if (!flowOk) {
    stopPump(pump);
    const float massAfter = scale.readGrams();
    result.mass_delta_g = massAfter - massBefore;
    result.gated_delay_ms = millis() - pumpStart;
    busy_ = false;
    return result;
  }

  delay(pourMs);
  stopPump(pump);
  delay(50);
  if (antiDripMs > 0) {
    runFor(pump, PumpDirection::kReverse, antiDripMs, kPumpPwmFull);
  }

  const float massAfter = scale.readGrams();
  result.mass_delta_g = massAfter - massBefore;
  result.ok = true;
  busy_ = false;
  return result;
}

void BenchRig::prime(PumpId pump, unsigned long durationMs) {
  busy_ = true;
  runFor(pump, PumpDirection::kForward, durationMs, kPumpPwmFull);
  busy_ = false;
}
