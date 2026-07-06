#pragma once

#include <atomic>
#include <cstddef>

#include "config.h"

struct WiFiStatus {
  bool connected = false;
  bool has_credentials = false;
  char ssid[33] = {0};
  char ip[16] = {0};
  int rssi = 0;
};

class WiFiManager {
 public:
  void begin();
  void tick();

  // Staging (RAM) — serial provisioning commands.
  void stageSsid(const char* ssid);
  void stagePassword(const char* password);
  bool saveCredentials();
  void clearCredentials();

  WiFiStatus status() const;

  bool connected() const {
    return status_.connected;
  }

 private:
  void loadCredentialsFromNvs();
  void startConnect();
  void updateStatus();
  void startMdns();

  char staged_ssid_[33] = {0};
  char staged_pass_[65] = {0};
  bool staged_dirty_ = false;

  WiFiStatus status_;
  std::atomic<bool> reconnect_requested_{false};
  unsigned long last_reconnect_attempt_ms_ = 0;
  bool mdns_started_ = false;
};
