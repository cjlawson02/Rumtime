#include <Arduino.h>

#include "config.h"
#include "pump_driver.h"

namespace {

BenchRig rig;

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
  Serial.println(F("  dispense <1|2> <ml>          — uses ml/s + anti-drip"));
  Serial.println(F("  prime <1|2> <ms>"));
  Serial.println(F("  cal <1|2> <ml_per_s>         — set calibration"));
  Serial.println(F("  cal run <1|2> <seconds>      — forward cal pour"));
  Serial.println(F("  antidrip <1|2> <ms>          — set reverse time"));
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
  Serial.print(F("busy="));
  Serial.println(rig.busy() ? F("yes") : F("no"));
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

  if (cmd.equalsIgnoreCase("dispense")) {
    int s = args.indexOf(' ');
    if (s < 0) {
      Serial.println(F("usage: dispense <1|2> <ml>"));
      return;
    }
    const PumpId pump = parsePump(args.substring(0, s));
    const float ml = args.substring(s + 1).toFloat();
    const uint8_t idx = static_cast<uint8_t>(pump);
    rig.dispenseMl(pump, ml, mlPerSecond[idx], antiDripMs[idx]);
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
  Serial.println();
  Serial.println(F("Rumtime bench-rig ready."));
  printHelp();
}

void loop() {
  if (!Serial.available()) {
    return;
  }

  String line = Serial.readStringUntil('\n');
  handleCommand(line);
}
