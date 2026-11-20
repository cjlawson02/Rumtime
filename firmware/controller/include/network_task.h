#pragma once

class RuntimeContext;

#include <cstdint>

void startNetworkTask(RuntimeContext& ctx);

// Lowest free stack (bytes) the network task has had; 0 before it starts.
uint32_t networkTaskStackFree();

// Wi-Fi manager owned by the network task (serial provisioning reads status).
class WiFiManager;
WiFiManager& networkWiFiManager();
