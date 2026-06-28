#pragma once

#include <stddef.h>
#include <stdint.h>

constexpr size_t kSerialLineMax = 127;
constexpr uint8_t kMaxCommandTokens = 8;
constexpr size_t kTokenMax = 24;

struct CommandLine {
  char tokens[kMaxCommandTokens][kTokenMax];
  uint8_t count = 0;
};

// Keep printable ASCII; trim whitespace in place.
void sanitizeSerialLine(char* line);

// Split on spaces into tokens. Returns false if line is empty after sanitize.
bool parseCommandLine(const char* line, CommandLine& out);
