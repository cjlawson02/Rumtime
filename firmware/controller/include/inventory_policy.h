#pragma once

#include <cmath>

#include "config.h"

// Shared primed + reserve check for InventoryStore and snapshot preflight.
inline bool inventoryPourAllowed(bool primed, float remaining_ml, float step_ml) {
  if (!primed) {
    return false;
  }
  if (!std::isfinite(step_ml) || step_ml <= 0.0f) {
    return false;
  }
  return remaining_ml >= (step_ml + kInventoryReserveMl);
}
