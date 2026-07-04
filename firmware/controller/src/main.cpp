#include <Arduino.h>

#include "control_task.h"

namespace {

ControlTask controlTask;

}  // namespace

void setup() {
  // Safe GPIO first (STBY low, IN1/IN2 low), then start the periodic ControlTask.
  controlTask.begin();
  controlTask.start();
}

void loop() {
  // Motion runs in ControlTask; keep loop() idle so it does not starve Core 1.
  vTaskDelay(pdMS_TO_TICKS(1000));
}
