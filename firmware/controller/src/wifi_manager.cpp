#include "wifi_manager.h"

#include <Arduino.h>
#include <ESPmDNS.h>
#include <Preferences.h>

#include <cstring>

namespace {

Preferences g_wifi_prefs;

}  // namespace

WiFiManager* WiFiManager::instance_ = nullptr;

void WiFiManager::onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (instance_ == nullptr) {
    return;
  }
  switch (event) {
#if defined(ARDUINO_EVENT_WIFI_STA_DISCONNECTED)
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      instance_->last_disconnect_reason_.store(info.wifi_sta_disconnected.reason,
                                               std::memory_order_relaxed);
      instance_->disconnect_pending_.store(true, std::memory_order_release);
      break;
#elif defined(WIFI_EVENT_STA_DISCONNECTED)
    case WIFI_EVENT_STA_DISCONNECTED:
      instance_->last_disconnect_reason_.store(info.wifi_sta_disconnected.reason,
                                               std::memory_order_relaxed);
      instance_->disconnect_pending_.store(true, std::memory_order_release);
      break;
#endif
    default:
      (void)info;
      break;
  }
}

void WiFiManager::begin() {
  instance_ = this;
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  // Pump motors + PCB antenna: modem sleep makes brief EMI look like a link drop.
  WiFi.setSleep(WIFI_PS_NONE);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.setHostname(kMdnsHostname);
  WiFi.onEvent(onWiFiEvent);
  loadCredentialsFromNvs();
  if (status_.has_credentials) {
    startConnect();
  }
}

void WiFiManager::loadCredentialsFromNvs() {
  status_ = WiFiStatus{};
  staged_ssid_[0] = '\0';
  staged_pass_[0] = '\0';
  if (!g_wifi_prefs.begin(kWifiCredNamespace, /*readOnly=*/true)) {
    return;
  }
  const String ssid = g_wifi_prefs.getString(kWifiSsidKey, "");
  const String pass = g_wifi_prefs.getString(kWifiPassKey, "");
  g_wifi_prefs.end();
  if (ssid.length() == 0) {
    return;
  }
  std::strncpy(status_.ssid, ssid.c_str(), sizeof(status_.ssid) - 1);
  std::strncpy(staged_ssid_, status_.ssid, sizeof(staged_ssid_) - 1);
  std::strncpy(staged_pass_, pass.c_str(), sizeof(staged_pass_) - 1);
  status_.has_credentials = true;
}

void WiFiManager::stageSsid(const char* ssid) {
  if (ssid == nullptr) {
    staged_ssid_[0] = '\0';
  } else {
    std::strncpy(staged_ssid_, ssid, sizeof(staged_ssid_) - 1);
    staged_ssid_[sizeof(staged_ssid_) - 1] = '\0';
  }
}

void WiFiManager::stagePassword(const char* password) {
  if (password == nullptr) {
    staged_pass_[0] = '\0';
  } else {
    std::strncpy(staged_pass_, password, sizeof(staged_pass_) - 1);
    staged_pass_[sizeof(staged_pass_) - 1] = '\0';
  }
}

bool WiFiManager::saveCredentials() {
  if (staged_ssid_[0] == '\0') {
    return false;
  }
  if (!g_wifi_prefs.begin(kWifiCredNamespace, /*readOnly=*/false)) {
    return false;
  }
  const bool ssid_ok = g_wifi_prefs.putString(kWifiSsidKey, staged_ssid_);
  const bool pass_ok = g_wifi_prefs.putString(kWifiPassKey, staged_pass_);
  if (!ssid_ok || !pass_ok) {
    g_wifi_prefs.remove(kWifiSsidKey);
    g_wifi_prefs.remove(kWifiPassKey);
    g_wifi_prefs.end();
    return false;
  }
  g_wifi_prefs.end();
  std::strncpy(status_.ssid, staged_ssid_, sizeof(status_.ssid) - 1);
  status_.has_credentials = true;
  reconnect_requested_.store(true, std::memory_order_release);
  return true;
}

void WiFiManager::clearCredentials() {
  staged_ssid_[0] = '\0';
  staged_pass_[0] = '\0';
  if (g_wifi_prefs.begin(kWifiCredNamespace, /*readOnly=*/false)) {
    g_wifi_prefs.remove(kWifiSsidKey);
    g_wifi_prefs.remove(kWifiPassKey);
    g_wifi_prefs.end();
  }
  status_.has_credentials = false;
  status_.ssid[0] = '\0';
  reconnect_requested_.store(false, std::memory_order_relaxed);
  disconnect_pending_.store(false, std::memory_order_relaxed);
  connect_in_progress_ = false;
  prefer_immediate_reconnect_ = false;
  last_reconnect_attempt_ms_ = 0;
  intentional_disconnect_ = true;
  WiFi.disconnect(/*wifioff=*/false, /*eraseap=*/true);
  mdns_started_ = false;
  updateStatus();
}

void WiFiManager::startConnect() {
  if (!status_.has_credentials) {
    return;
  }
  if (!g_wifi_prefs.begin(kWifiCredNamespace, /*readOnly=*/true)) {
    return;
  }
  const String ssid = g_wifi_prefs.getString(kWifiSsidKey, "");
  const String pass = g_wifi_prefs.getString(kWifiPassKey, "");
  g_wifi_prefs.end();
  if (ssid.length() == 0) {
    return;
  }
  // Do not WiFi.disconnect(true) here — that races with disconnect_pending_ and
  // used to clear connect_in_progress_ on the next tick.
  WiFi.setSleep(WIFI_PS_NONE);
  WiFi.begin(ssid.c_str(), pass.c_str());
  connect_in_progress_ = true;
  connect_started_ms_ = millis();
  last_reconnect_attempt_ms_ = connect_started_ms_;
}

void WiFiManager::tryReconnect(bool immediate) {
  if (!status_.has_credentials || connect_in_progress_) {
    return;
  }

  const unsigned long now = millis();
  const unsigned long min_gap = immediate ? kWifiReconnectCooldownMs : kWifiReconnectBackoffMs;
  if (last_reconnect_attempt_ms_ != 0 && (now - last_reconnect_attempt_ms_) < min_gap) {
    return;
  }
  startConnect();
}

void WiFiManager::startMdns() {
  if (mdns_started_) {
    return;
  }
  if (MDNS.begin(kMdnsHostname)) {
    MDNS.addService("http", "tcp", kHttpPort);
    mdns_started_ = true;
  }
}

void WiFiManager::updateStatus() {
  status_.connected = WiFi.status() == WL_CONNECTED;
  status_.rssi = status_.connected ? WiFi.RSSI() : 0;
  if (status_.connected) {
    const IPAddress ip = WiFi.localIP();
    std::snprintf(status_.ip, sizeof(status_.ip), "%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
  } else {
    status_.ip[0] = '\0';
  }
}

void WiFiManager::tick() {
  const unsigned long now = millis();

  if (reconnect_requested_.exchange(false, std::memory_order_acq_rel)) {
    mdns_started_ = false;
    connect_in_progress_ = false;
    startConnect();
  }

  if (disconnect_pending_.exchange(false, std::memory_order_acq_rel)) {
    mdns_started_ = false;
    const uint8_t reason =
        last_disconnect_reason_.exchange(0, std::memory_order_relaxed);
    if (intentional_disconnect_) {
      intentional_disconnect_ = false;
    } else {
      // Unexpected drop (EMI, AP kick, etc.) — reconnect ASAP.
      prefer_immediate_reconnect_ = true;
      connect_in_progress_ = false;
      status_.last_disconnect_reason = reason;
      Serial.print("wifi: disconnected reason=");
      Serial.println(reason);
    }
  }

  updateStatus();

  // Success path: must clear connect_in_progress_ or the 45s connect timeout
  // force-disconnects a healthy link in a loop.
  if (status_.connected) {
    connect_in_progress_ = false;
    prefer_immediate_reconnect_ = false;
    intentional_disconnect_ = false;
    startMdns();
    return;
  }

  if (!status_.has_credentials) {
    return;
  }

  if (connect_in_progress_) {
    if ((now - connect_started_ms_) >= kWifiConnectTimeoutMs) {
      intentional_disconnect_ = true;
      WiFi.disconnect(/*wifioff=*/false, /*eraseap=*/false);
      connect_in_progress_ = false;
      last_reconnect_attempt_ms_ = now;
      prefer_immediate_reconnect_ = false;
      Serial.println("wifi: connect timeout");
    } else {
      return;
    }
  }

  tryReconnect(prefer_immediate_reconnect_);
}

WiFiStatus WiFiManager::status() const {
  return status_;
}
