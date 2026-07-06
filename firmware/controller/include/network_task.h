#pragma once

#pragma once

class RuntimeContext;

void startNetworkTask(RuntimeContext& ctx);

// Wi-Fi manager owned by the network task (serial provisioning reads status).
class WiFiManager;
WiFiManager& networkWiFiManager();
