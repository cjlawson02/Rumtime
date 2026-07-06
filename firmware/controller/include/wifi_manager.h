#pragma once

#include <WiFi.h>

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
  static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info);
  static WiFiManager* instance_;

  void loadCredentialsFromNvs();
  void startConnect();
  void tryReconnect(bool immediate);
  void updateStatus();
  void startMdns();

  char staged_ssid_[33] = {0};
  char staged_pass_[65] = {0};

  WiFiStatus status_;
  std::atomic<bool> reconnect_requested_{false};
  std::atomic<bool> disconnect_pending_{false};
  unsigned long last_reconnect_attempt_ms_ = 0;
  unsigned long connect_started_ms_ = 0;
  bool connect_in_progress_ = false;
  bool prefer_immediate_reconnect_ = false;
  bool mdns_started_ = false;
};
