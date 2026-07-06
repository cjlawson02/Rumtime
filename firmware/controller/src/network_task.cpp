#include "network_task.h"

#include <Arduino.h>

#include "config.h"
#include "esp_task_wdt.h"
#include "http_server.h"
#include "queue_ops.h"
#include "runtime_context.h"
#include "wifi_manager.h"

namespace {

WiFiManager g_wifi;
RuntimeContext* g_ctx = nullptr;

void networkTaskEntry(void* arg) {
  (void)arg;
  if (esp_task_wdt_add(nullptr) != ESP_OK) {
    Serial.println("NetworkTask: TWDT add failed");
  }
  g_wifi.begin();
  beginHttpServer(*g_ctx, g_wifi);
  for (;;) {
    g_wifi.tick();
    handleHttpClients();
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

}  // namespace

void startNetworkTask(RuntimeContext& ctx) {
  g_ctx = &ctx;
  xTaskCreatePinnedToCore(networkTaskEntry, "network", kNetworkTaskStackBytes, nullptr,
                          kNetworkTaskPriority, nullptr, kNetworkTaskCore);
}

WiFiManager& networkWiFiManager() {
  return g_wifi;
}
