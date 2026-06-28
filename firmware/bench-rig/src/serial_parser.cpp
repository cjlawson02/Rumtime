#include "serial_parser.h"

#include <string.h>

void sanitizeSerialLine(char* line) {
  if (line == nullptr) {
    return;
  }

  char* write = line;
  for (const char* read = line; *read != '\0'; ++read) {
    const char c = *read;
    if (c >= 32 && c <= 126) {
      *write++ = c;
    }
  }
  *write = '\0';

  size_t start = 0;
  while (line[start] == ' ') {
    ++start;
  }
  if (start > 0) {
    memmove(line, line + start, strlen(line + start) + 1);
  }

  const size_t len = strlen(line);
  size_t end = len;
  while (end > 0 && line[end - 1] == ' ') {
    --end;
  }
  line[end] = '\0';
}

bool parseCommandLine(const char* line, CommandLine& out) {
  out.count = 0;
  if (line == nullptr || line[0] == '\0') {
    return false;
  }

  char buffer[kSerialLineMax + 1];
  strncpy(buffer, line, kSerialLineMax);
  buffer[kSerialLineMax] = '\0';

  char* save = nullptr;
  char* token = strtok_r(buffer, " ", &save);
  while (token != nullptr && out.count < kMaxCommandTokens) {
    strncpy(out.tokens[out.count], token, kTokenMax - 1);
    out.tokens[out.count][kTokenMax - 1] = '\0';
    ++out.count;
    token = strtok_r(nullptr, " ", &save);
  }

  return out.count > 0;
}
