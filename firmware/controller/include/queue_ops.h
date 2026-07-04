#pragma once

#include <cstddef>

// Injected depth-1 command queue backend (docs/16). CommandQueue owns cancel
// policy; this seam is transport only (FreeRTOS on ESP32, in-memory fake on host).
// send/receive must be non-blocking (zero block time on the ESP32 path).
struct QueueOps {
  void* (*create)(std::size_t item_size);
  void (*destroy)(void* handle);
  bool (*send)(void* handle, const void* item, std::size_t item_size);
  bool (*receive)(void* handle, void* out, std::size_t item_size);
  void (*reset)(void* handle);
  unsigned (*pending)(void* handle);
};
