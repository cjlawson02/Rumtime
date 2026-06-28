#include <Arduino.h>
#include <strings.h>

#include "config.h"
#include "pump_driver.h"
#include "scale_driver.h"
#include "serial_parser.h"

namespace {

BenchRig rig;
ScaleDriver scale;

float mlPerSecond[2] = {kDefaultMlPerSecond, kDefaultMlPerSecond};
unsigned long antiDripMs[2] = {kDefaultAntiDripMs, kDefaultAntiDripMs};

char serialLine[kSerialLineMax + 1];
size_t serialLineLen = 0;
bool inHandler = false;

void handleCommand(const char* line);
void printUsage(const __FlashStringHelper* msg);

void serviceSerial() {
  while (Serial.available()) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      if (serialLineLen > 0) {
        serialLine[serialLineLen] = '\0';
        if (inHandler) {
          sanitizeSerialLine(serialLine);
          if (strcasecmp(serialLine, "stop") == 0) {
            rig.stopAll();
            Serial.println(F("stopped"));
          }
        } else {
          handleCommand(serialLine);
        }
        serialLineLen = 0;
        serialLine[0] = '\0';
      }
      continue;
    }
    if (c >= 32 && c <= 126) {
      if (serialLineLen < kSerialLineMax) {
        serialLine[serialLineLen++] = c;
      } else {
        serialLineLen = 0;
        Serial.println(F("err=line_too_long"));
      }
    }
  }
}

void delayWithSerial(unsigned long ms) {
  const unsigned long end = millis() + ms;
  while (millis() < end) {
    serviceSerial();
    delay(1);
  }
}

bool parsePumpId(const char* token, PumpId& pump) {
  if (token == nullptr) {
    return false;
  }
  if (strcmp(token, "1") == 0 || strcasecmp(token, "p1") == 0) {
    pump = PumpId::kPump1;
    return true;
  }
  if (strcmp(token, "2") == 0 || strcasecmp(token, "p2") == 0) {
    pump = PumpId::kPump2;
    return true;
  }
  return false;
}

bool parseBothPumps(const char* token) {
  if (token == nullptr) {
    return false;
  }
  return strcasecmp(token, "both") == 0 || strcmp(token, "1+2") == 0 ||
         strcasecmp(token, "all") == 0;
}

bool parseDirection(const char* token, PumpDirection& dir) {
  if (token == nullptr) {
    return false;
  }
  if (strcasecmp(token, "fwd") == 0 || strcasecmp(token, "forward") == 0) {
    dir = PumpDirection::kForward;
    return true;
  }
  if (strcasecmp(token, "rev") == 0 || strcasecmp(token, "reverse") == 0) {
    dir = PumpDirection::kReverse;
    return true;
  }
  return false;
}

void printUsage(const __FlashStringHelper* msg) {
  Serial.print(F("err="));
  Serial.println(msg);
}

void printHelp() {
  Serial.println(F("Rumtime bench-rig commands:"));
  Serial.println(F("  help | version"));
  Serial.println(F("  stop"));
  Serial.println(F("  run <1|2|both> <fwd|rev> <ms>"));
  Serial.println(F("  dispense <1|2> <ml>"));
  Serial.println(F("  dispense-gated <1|2> <ml>"));
  Serial.println(F("  prime <1|2> <ms>"));
  Serial.println(F("  cal <1|2> <ml_per_s>  |  cal run <1|2> <seconds>"));
  Serial.println(F("  antidrip <1|2> <ms>"));
  Serial.println(F("  tare | weight | status"));
  Serial.println(F("  weight-stream <interval_ms> [duration_ms]"));
  Serial.println(F("  flowcfg <g> <N> <timeout_ms> | scalecal <factor>"));
  Serial.println(F("Host CLI: scripts/benchctl.py (recommended)"));
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
    serviceSerial();

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

    delayWithSerial(intervalMs);
  }

  Serial.print(F("peak_abs_dW_g="));
  Serial.println(peakAbsDelta, 4);
}

void handleCommand(const char* rawLine) {
  char line[kSerialLineMax + 1];
  strncpy(line, rawLine, kSerialLineMax);
  line[kSerialLineMax] = '\0';
  sanitizeSerialLine(line);
  if (line[0] == '\0') {
    return;
  }

  CommandLine cmd;
  if (!parseCommandLine(line, cmd)) {
    return;
  }

  inHandler = true;
  const char* verb = cmd.tokens[0];

  if (strcasecmp(verb, "help") == 0 || strcmp(verb, "?") == 0) {
    printHelp();
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "version") == 0) {
    Serial.println(F("ok=bench-rig proto=2 parser=fixed-buffer"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "stop") == 0) {
    rig.stopAll();
    Serial.println(F("stopped"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "status") == 0) {
    printStatus();
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "tare") == 0) {
    scale.tare();
    Serial.println(F("tared"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "weight") == 0) {
    Serial.print(F("weight_g="));
    Serial.println(scale.readFilteredGrams(), 3);
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "weight-stream") == 0) {
    if (cmd.count < 2) {
      printUsage(F("usage weight-stream <interval_ms> [duration_ms]"));
      inHandler = false;
      return;
    }
    unsigned long intervalMs = strtoul(cmd.tokens[1], nullptr, 10);
    unsigned long durationMs = 30000;
    if (cmd.count >= 3) {
      durationMs = strtoul(cmd.tokens[2], nullptr, 10);
    }
    runWeightStream(intervalMs, durationMs);
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "flowcfg") == 0) {
    if (cmd.count < 4) {
      printUsage(F("usage flowcfg <threshold_g> <consecutive> <timeout_ms>"));
      inHandler = false;
      return;
    }
    scale.setFlowConfig(strtof(cmd.tokens[1], nullptr),
                        static_cast<int>(strtol(cmd.tokens[2], nullptr, 10)),
                        strtoul(cmd.tokens[3], nullptr, 10));
    Serial.println(F("flow config updated"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "scalecal") == 0) {
    if (cmd.count < 2) {
      printUsage(F("usage scalecal <factor>"));
      inHandler = false;
      return;
    }
    scale.setCalibrationFactor(strtof(cmd.tokens[1], nullptr));
    scale.tare();
    Serial.println(F("scale calibration updated, tared"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "run") == 0) {
    if (cmd.count < 4) {
      printUsage(F("usage run <1|2|both> <fwd|rev> <ms>"));
      inHandler = false;
      return;
    }
    PumpDirection dir;
    if (!parseDirection(cmd.tokens[2], dir)) {
      printUsage(F("bad_direction use fwd|rev"));
      inHandler = false;
      return;
    }
    const unsigned long ms = strtoul(cmd.tokens[3], nullptr, 10);
    if (ms == 0) {
      printUsage(F("bad_ms"));
      inHandler = false;
      return;
    }
    if (parseBothPumps(cmd.tokens[1])) {
      rig.runPump(PumpId::kPump1, dir, kPumpPwmFull);
      rig.runPump(PumpId::kPump2, dir, kPumpPwmFull);
      delayWithSerial(ms);
      rig.stopAll();
      Serial.println(F("done"));
      inHandler = false;
      return;
    }
    PumpId pump;
    if (!parsePumpId(cmd.tokens[1], pump)) {
      printUsage(F("bad_pump use 1|2|both"));
      inHandler = false;
      return;
    }
    rig.runPump(pump, dir, kPumpPwmFull);
    delayWithSerial(ms);
    rig.stopPump(pump);
    Serial.println(F("done"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "dispense-gated") == 0) {
    if (cmd.count < 3) {
      printUsage(F("usage dispense-gated <1|2> <ml>"));
      inHandler = false;
      return;
    }
    PumpId pump;
    if (!parsePumpId(cmd.tokens[1], pump)) {
      printUsage(F("bad_pump use 1|2"));
      inHandler = false;
      return;
    }
    const float ml = strtof(cmd.tokens[2], nullptr);
    const uint8_t idx = static_cast<uint8_t>(pump);
    const GatedDispenseResult result =
        rig.dispenseMlGated(pump, ml, mlPerSecond[idx], antiDripMs[idx], scale);
    printGatedResult(result);
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "dispense") == 0) {
    if (cmd.count < 3) {
      printUsage(F("usage dispense <1|2> <ml>"));
      inHandler = false;
      return;
    }
    PumpId pump;
    if (!parsePumpId(cmd.tokens[1], pump)) {
      printUsage(F("bad_pump use 1|2"));
      inHandler = false;
      return;
    }
    const float ml = strtof(cmd.tokens[2], nullptr);
    const uint8_t idx = static_cast<uint8_t>(pump);
    const float massBefore = scale.readGrams();
    rig.dispenseMl(pump, ml, mlPerSecond[idx], antiDripMs[idx]);
    const float massAfter = scale.readGrams();
    Serial.print(F("mass_delta_g="));
    Serial.println(massAfter - massBefore, 2);
    Serial.println(F("done"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "prime") == 0) {
    if (cmd.count < 3) {
      printUsage(F("usage prime <1|2> <ms>"));
      inHandler = false;
      return;
    }
    PumpId pump;
    if (!parsePumpId(cmd.tokens[1], pump)) {
      printUsage(F("bad_pump use 1|2"));
      inHandler = false;
      return;
    }
    const unsigned long ms = strtoul(cmd.tokens[2], nullptr, 10);
    if (ms == 0) {
      printUsage(F("bad_ms"));
      inHandler = false;
      return;
    }
    rig.prime(pump, ms);
    Serial.println(F("done"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "cal") == 0) {
    if (cmd.count >= 4 && strcasecmp(cmd.tokens[1], "run") == 0) {
      PumpId pump;
      if (!parsePumpId(cmd.tokens[2], pump)) {
        printUsage(F("bad_pump use 1|2"));
        inHandler = false;
        return;
      }
      const unsigned long ms =
          static_cast<unsigned long>(strtof(cmd.tokens[3], nullptr) * 1000.0f);
      rig.runPump(pump, PumpDirection::kForward, kPumpPwmFull);
      delayWithSerial(ms);
      rig.stopPump(pump);
      Serial.println(F("measure output ml, then: cal <pump> <ml_per_s>"));
      inHandler = false;
      return;
    }
    if (cmd.count < 3) {
      printUsage(F("usage cal <1|2> <ml_per_s> OR cal run <1|2> <seconds>"));
      inHandler = false;
      return;
    }
    PumpId pump;
    if (!parsePumpId(cmd.tokens[1], pump)) {
      printUsage(F("bad_pump use 1|2"));
      inHandler = false;
      return;
    }
    mlPerSecond[static_cast<uint8_t>(pump)] = strtof(cmd.tokens[2], nullptr);
    Serial.println(F("calibration saved"));
    inHandler = false;
    return;
  }

  if (strcasecmp(verb, "antidrip") == 0) {
    if (cmd.count < 3) {
      printUsage(F("usage antidrip <1|2> <ms>"));
      inHandler = false;
      return;
    }
    PumpId pump;
    if (!parsePumpId(cmd.tokens[1], pump)) {
      printUsage(F("bad_pump use 1|2"));
      inHandler = false;
      return;
    }
    antiDripMs[static_cast<uint8_t>(pump)] = strtoul(cmd.tokens[2], nullptr, 10);
    Serial.println(F("anti-drip updated"));
    inHandler = false;
    return;
  }

  Serial.print(F("err=unknown cmd="));
  Serial.println(verb);
  inHandler = false;
}

}  // namespace

void benchPollSerial(unsigned long ms) { delayWithSerial(ms); }

void setup() {
  Serial.begin(115200);
  const unsigned long usbWaitStart = millis();
  while (!Serial && millis() - usbWaitStart < 3000) {
    delay(10);
  }
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

void loop() { serviceSerial(); }
