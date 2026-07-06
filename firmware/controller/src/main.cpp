#include <Arduino.h>

#include "control_task.h"
#include "network_task.h"
#include "runtime_context.h"

namespace {

ControlTask controlTask;

}  // namespace

void setup() {
  controlTask.begin();
  controlTask.start();
  startNetworkTask(runtimeContext());
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}
