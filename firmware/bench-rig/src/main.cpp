#include <Arduino.h>

#include "config.h"
#include "pump_driver.h"
#include "scale_driver.h"

namespace {

BenchRig rig;
ScaleDriver scale;

float mlPerSecond[2] = {1.5f, 1.5f};  // Placeholder — calibrate on bench.
unsigned long antiDripMs[2] = {kDefaultAntiDripMs, kDefaultAntiDripMs};

PumpId parsePump(const String& token) {
  if (token == "1" || token.equalsIgnoreCase("p1")) {
    return PumpId::kPump1;
  }
  if (token == "2" || token.equalsIgnoreCase("p2")) {
    return PumpId::kPump2;
  }
  return PumpId::kPump1;
}

PumpDirection parseDirection(const String& token) {
  if (token.equalsIgnoreCase("fwd") || token.equalsIgnoreCase("forward")) {
    return PumpDirection::kForward;
  }
  if (token.equalsIgnoreCase("rev") || token.equalsIgnoreCase("reverse")) {
    return PumpDirection::kReverse;
  }
  return PumpDirection::kStop;
}

void printHelp() {
  Serial.println(F("Rumtime bench-rig commands:"));
  Serial.println(F("  help"));
  Serial.println(F("  stop"));
  Serial.println(F("  run <1|2> <fwd|rev> <ms>     — timed run"));
  Serial.println(F("  dispense <1|2> <ml>          — timed from motor-on"));
  Serial.println(F("  dispense-gated <1|2> <ml>    — flow-gated pour (Test 9)"));
  Serial.println(F("  prime <1|2> <ms>"));
  Serial.println(F("  cal <1|2> <ml_per_s>         — set calibration"));
  Serial.println(F("  cal run <1|2> <seconds>      — forward cal pour"));
  Serial.println(F("  antidrip <1|2> <ms>          — set reverse time"));
  Serial.println(F("  tare                         — zero scale"));
  Serial.println(F("  weight                       — grams (filtered)"));
  Serial.println(F("  weight-stream <ms> [dur_ms]  — log weight + dW (Test 7.6)"));
  Serial.println(F("  flowcfg <g> <N> <timeout_ms> — flow-gate tuning"));
  Serial.println(F("  scalecal <factor>            — HX711 calibration factor"));
  Serial.println(F("  status"));
}

void printStatus() {
  Serial.println(F("--- status ---"));
  for (int i = 0; i < 2; ++i) {
    Serial.print(F("P"));
    Serial.print(i + 1);
    Serial.print(F(" ml/s="));
    Serial.print(mlPerSecond[i], 3);
    Serial.print(F(" anti_drip_ms="));
    Serial.println(antiDripMs[i]);
  }
  Serial.print(F("scale_ready="));
  Serial.println(scale.ready() ? F("yes") : F("no"));
  Serial.print(F("scale_cal="));
  Serial.println(scale.calibrationFactor(), 1);
  Serial.print(F("flow_threshold_g="));
  Serial.println(scale.flowThresholdG(), 4);
  Serial.print(F("flow_consecutive="));
  Serial.println(scale.flowDetectConsecutive());
  Serial.print(F("flow_timeout_ms="));
  Serial.println(scale.flowDetectTimeoutMs());
  Serial.print(F("weight_g="));
  Serial.println(scale.readFilteredGrams(), 2);
  Serial.print(F("busy="));
  Serial.println(rig.busy() ? F("yes") : F("no"));
}

void printGatedResult(const GatedDispenseResult& result) {
  Serial.print(F("ok="));
  Serial.println(result.ok ? F("yes") : F("no"));
  Serial.print(F("gated_delay_ms="));
  Serial.println(result.gated_delay_ms);
  Serial.print(F("timed_ms="));
  Serial.println(result.timed_ms);
  Serial.print(F("mass_delta_g="));
  Serial.println(result.mass_delta_g, 2);
}

void runWeightStream(unsigned long intervalMs, unsigned long durationMs) {
  if (intervalMs < 20) {
    intervalMs = 20;
  }

  Serial.print(F("weight-stream interval_ms="));
  Serial.print(intervalMs);
  Serial.print(F(" duration_ms="));
  Serial.println(durationMs);

  float prevWeight = scale.readFilteredGrams();
  float peakAbsDelta = 0.0f;
  const unsigned long start = millis();

  while (millis() - start < durationMs) {
    if (Serial.available()) {
      String line = Serial.readStringUntil('\n');
      line.trim();
      if (line.equalsIgnoreCase("stop")) {
        Serial.println(F("stream stopped"));
        break;
      }
    }

    const unsigned long t = millis() - start;
    const float weight = scale.readFilteredGrams();
    const float delta = weight - prevWeight;
    prevWeight = weight;

    const float absDelta = fabsf(delta);
    if (absDelta > peakAbsDelta) {
      peakAbsDelta = absDelta;
    }

    Serial.print(F("t="));
    Serial.print(t);
    Serial.print(F(" weight_g="));
    Serial.print(weight, 3);
    Serial.print(F(" dW_g="));
    Serial.println(delta, 4);

    delay(intervalMs);
  }

  Serial.print(F("peak_abs_dW_g="));
  Serial.println(peakAbsDelta, 4);
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) {
    return;
  }

  int space = line.indexOf(' ');
  const String cmd = space < 0 ? line : line.substring(0, space);
  String args = space < 0 ? String() : line.substring(space + 1);
  args.trim();

  if (cmd.equalsIgnoreCase("help") || cmd == "?") {
    printHelp();
    return;
  }

  if (cmd.equalsIgnoreCase("stop")) {
    rig.stopAll();
    Serial.println(F("stopped"));
    return;
  }

  if (cmd.equalsIgnoreCase("status")) {
    printStatus();
    return;
  }

  if (cmd.equalsIgnoreCase("tare")) {
    scale.tare();
    Serial.println(F("tared"));
    return;
  }

  if (cmd.equalsIgnoreCase("weight")) {
    Serial.print(F("weight_g="));
    Serial.println(scale.readFilteredGrams(), 3);
    return;
  }

  if (cmd.equalsIgnoreCase("weight-stream")) {
    if (args.length() == 0) {
      Serial.println(F("usage: weight-stream <interval_ms> [duration_ms]"));
      return;
    }
    int s = args.indexOf(' ');
    unsigned long intervalMs = 0;
    unsigned long durationMs = 30000;
    if (s < 0) {
      intervalMs = args.toInt();
    } else {
      intervalMs = args.substring(0, s).toInt();
      const unsigned long parsed = args.substring(s + 1).toInt();
      if (parsed > 0) {
        durationMs = parsed;
      }
    }
    runWeightStream(intervalMs, durationMs);
    return;
  }

  if (cmd.equalsIgnoreCase("flowcfg")) {
    int s1 = args.indexOf(' ');
    int s2 = args.indexOf(' ', s1 + 1);
    if (s1 < 0 || s2 < 0) {
      Serial.println(F("usage: flowcfg <threshold_g> <consecutive> <timeout_ms>"));
      return;
    }
    const float threshold = args.substring(0, s1).toFloat();
    const int consecutive = args.substring(s1 + 1, s2).toInt();
    const unsigned long timeoutMs = args.substring(s2 + 1).toInt();
    scale.setFlowConfig(threshold, consecutive, timeoutMs);
    Serial.println(F("flow config updated"));
    return;
  }

  if (cmd.equalsIgnoreCase("scalecal")) {
    if (args.length() == 0) {
      Serial.println(F("usage: scalecal <factor>"));
      return;
    }
    scale.setCalibrationFactor(args.toFloat());
    scale.tare();
    Serial.println(F("scale calibration updated, tared"));
    return;
  }

  if (cmd.equalsIgnoreCase("run")) {
    int s1 = args.indexOf(' ');
    int s2 = args.indexOf(' ', s1 + 1);
    if (s1 < 0 || s2 < 0) {
      Serial.println(F("usage: run <1|2> <fwd|rev> <ms>"));
      return;
    }
    const PumpId pump = parsePump(args.substring(0, s1));
    const PumpDirection dir = parseDirection(args.substring(s1 + 1, s2));
    const unsigned long ms = args.substring(s2 + 1).toInt();
    rig.runPump(pump, dir, kPumpPwmFull);
    delay(ms);
    rig.stopPump(pump);
    Serial.println(F("done"));
    return;
  }

  if (cmd.equalsIgnoreCase("dispense-gated")) {
    int s = args.indexOf(' ');
    if (s < 0) {
      Serial.println(F("usage: dispense-gated <1|2> <ml>"));
      return;
    }
    const PumpId pump = parsePump(args.substring(0, s));
    const float ml = args.substring(s + 1).toFloat();
    const uint8_t idx = static_cast<uint8_t>(pump);
    const GatedDispenseResult result =
        rig.dispenseMlGated(pump, ml, mlPerSecond[idx], antiDripMs[idx], scale);
    printGatedResult(result);
    return;
  }

  if (cmd.equalsIgnoreCase("dispense")) {
    int s = args.indexOf(' ');
    if (s < 0) {
      Serial.println(F("usage: dispense <1|2> <ml>"));
      return;
    }
    const PumpId pump = parsePump(args.substring(0, s));
    const float ml = args.substring(s + 1).toFloat();
    const uint8_t idx = static_cast<uint8_t>(pump);
    const float massBefore = scale.readGrams();
    rig.dispenseMl(pump, ml, mlPerSecond[idx], antiDripMs[idx]);
    const float massAfter = scale.readGrams();
    Serial.print(F("mass_delta_g="));
    Serial.println(massAfter - massBefore, 2);
    Serial.println(F("done"));
    return;
  }

  if (cmd.equalsIgnoreCase("prime")) {
    int s = args.indexOf(' ');
    if (s < 0) {
      Serial.println(F("usage: prime <1|2> <ms>"));
      return;
    }
    const PumpId pump = parsePump(args.substring(0, s));
    const unsigned long ms = args.substring(s + 1).toInt();
    rig.prime(pump, ms);
    Serial.println(F("done"));
    return;
  }

  if (cmd.equalsIgnoreCase("cal")) {
    if (args.startsWith("run ")) {
      String rest = args.substring(4);
      rest.trim();
      int s = rest.indexOf(' ');
      if (s < 0) {
        Serial.println(F("usage: cal run <1|2> <seconds>"));
        return;
      }
      const PumpId pump = parsePump(rest.substring(0, s));
      const unsigned long ms = rest.substring(s + 1).toFloat() * 1000.0f;
      rig.runPump(pump, PumpDirection::kForward, kPumpPwmFull);
      delay(ms);
      rig.stopPump(pump);
      Serial.println(F("measure output ml, then: cal <pump> <ml_per_s>"));
      return;
    }

    int s = args.indexOf(' ');
    if (s < 0) {
      Serial.println(F("usage: cal <1|2> <ml_per_s>  OR  cal run <1|2> <seconds>"));
      return;
    }
    const PumpId pump = parsePump(args.substring(0, s));
    const float rate = args.substring(s + 1).toFloat();
    mlPerSecond[static_cast<uint8_t>(pump)] = rate;
    Serial.println(F("calibration saved"));
    return;
  }

  if (cmd.equalsIgnoreCase("antidrip")) {
    int s = args.indexOf(' ');
    if (s < 0) {
      Serial.println(F("usage: antidrip <1|2> <ms>"));
      return;
    }
    const PumpId pump = parsePump(args.substring(0, s));
    antiDripMs[static_cast<uint8_t>(pump)] = args.substring(s + 1).toInt();
    Serial.println(F("anti-drip updated"));
    return;
  }

  Serial.println(F("unknown command — type help"));
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);
  rig.begin();
  rig.stopAll();
  scale.begin();
  Serial.println();
  Serial.println(F("Rumtime bench-rig ready."));
  if (!scale.ready()) {
    Serial.println(F("WARN: HX711 not ready — check wiring."));
  }
  printHelp();
}

void loop() {
  if (!Serial.available()) {
    return;
  }

  String line = Serial.readStringUntil('\n');
  handleCommand(line);
}
