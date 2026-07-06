#pragma once

#include <cstddef>
#include <cstdint>

inline uint32_t crc32Update(uint32_t crc, const uint8_t* data, std::size_t len) {
  crc = ~crc;
  for (std::size_t i = 0; i < len; ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) {
      const uint32_t mask = -(crc & 1U);
      crc = (crc >> 1) ^ (0xEDB88320U & mask);
    }
  }
  return ~crc;
}

inline uint32_t crc32OfBytes(const void* data, std::size_t len, uint32_t seed = 0) {
  return crc32Update(seed, static_cast<const uint8_t*>(data), len);
}

// Zero record.crc32, then CRC the full POD (shared by config + inventory NVS blobs).
template <typename T>
inline uint32_t crc32OfRecord(T record) {
  record.crc32 = 0;
  return crc32OfBytes(&record, sizeof(record));
}
