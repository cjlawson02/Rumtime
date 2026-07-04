#pragma once

// Injected HX711 seam so scale_platform.cpp stays host-safe. Native tests use a
// fake; the ESP32 build wires bogde/HX711 in control_task.cpp.
struct ScaleOps {
  void (*begin)(int dout, int sck);
  bool (*waitReady)(unsigned long timeout_ms);
  bool (*isReady)();
  float (*getUnits)();
  long (*readRaw)();
  void (*setScale)(float factor);
  void (*setOffset)(long offset);
};
