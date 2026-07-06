#pragma once

class RuntimeContext;
class WiFiManager;

void beginHttpServer(RuntimeContext& ctx, WiFiManager& wifi);
void handleHttpClients();
