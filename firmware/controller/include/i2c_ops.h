#pragma once

#include <cstdint>

// Host-testable Wire-like seam for MCP23017 pump modules.
struct I2cOps {
  // Bring up the controller I2C peripheral (no-op in native tests).
  void (*beginBus)(int sda, int scl);
  // Write one device register. Returns false on NACK / missing device.
  bool (*writeReg)(uint8_t addr7, uint8_t reg, uint8_t value);
};
