#include "network_task.h"

#include <Arduino.h>

#include "config.h"
#include "esp_task_wdt.h"
#include "http_server.h"
#include "queue_ops.h"
#include "runtime_context.h"
#include "wifi_link_safety.h"
#include "wifi_manager.h"

namespace {

WiFiManager g_wifi;
RuntimeContext* g_ctx = nullptr;
StatusSnapshot g_wifi_lost_status;  // network task only; keeps ~1.4 KB off its stack
TaskHandle_t g_network_task = nullptr;

void networkTaskEntry(void* arg) {
  (void)arg;
  if (esp_task_wdt_add(nullptr) != ESP_OK) {
    Serial.println("NetworkTask: TWDT add failed");
  }
  g_wifi.begin();
  beginHttpServer(*g_ctx, g_wifi);
  for (;;) {
    const bool was_connected = g_wifi.connected();
    g_wifi.tick();
    // STA drop mid-job: kiosk cannot reach /cancel — abort via cancel side-channel.
    if (was_connected && !g_wifi.connected()) {
      g_ctx->status.read(g_wifi_lost_status);
      cancelOnWifiLost(g_ctx->queue, true, false, g_wifi_lost_status);
    }
    handleHttpClients();
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

}  // namespace

void startNetworkTask(RuntimeContext& ctx) {
  g_ctx = &ctx;
  if (xTaskCreatePinnedToCore(networkTaskEntry, "network", kNetworkTaskStackBytes, nullptr,
                              kNetworkTaskPriority, &g_network_task, kNetworkTaskCore) != pdPASS) {
    Serial.println("NetworkTask: create failed (out of memory)");
  }
}

uint32_t networkTaskStackFree() {
  return g_network_task == nullptr
             ? 0
             : static_cast<uint32_t>(uxTaskGetStackHighWaterMark(g_network_task));
}

WiFiManager& networkWiFiManager() {
  return g_wifi;
}
