#include "http_server.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>

#include <cstring>

#include "command_queue.h"
#include "command_validate.h"
#include "config.h"
#include "coordinator.h"
#include "device_status.h"
#include "http_validate.h"
#include "pump_bus.h"
#include "runtime_context.h"
#include "wifi_manager.h"

namespace {

WebServer g_server(kHttpPort);
RuntimeContext* g_ctx = nullptr;
WiFiManager* g_wifi = nullptr;

constexpr size_t kMaxHttpBodyBytes = 2048;

void addCorsHeaders() {
  g_server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  g_server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void sendError(HttpStatus status, const char* code, const char* message) {
  addCorsHeaders();
  JsonDocument doc;
  doc["error"] = code;
  doc["message"] = message;
  String body;
  serializeJson(doc, body);
  g_server.send(static_cast<int>(status), "application/json", body);
}

void sendNoContent() {
  addCorsHeaders();
  g_server.send(static_cast<int>(HttpStatus::kOkNoContent), "text/plain", "");
}

void handleOptions() {
  addCorsHeaders();
  g_server.send(204);
}

bool rejectOversizedBody() {
  if (g_server.hasHeader("Content-Length")) {
    const int content_length = g_server.header("Content-Length").toInt();
    if (content_length < 0 || static_cast<size_t>(content_length) > kMaxHttpBodyBytes) {
      sendError(HttpStatus::kBadRequest, "bad_request", "Body too large");
      return true;
    }
  }
  if (g_server.arg("plain").length() > kMaxHttpBodyBytes) {
    sendError(HttpStatus::kBadRequest, "bad_request", "Body too large");
    return true;
  }
  return false;
}

CommandReject rejectFromEnqueue(bool ok) {
  return ok ? CommandReject::kNone : CommandReject::kBusy;
}

bool runtimeReady() {
  return g_ctx != nullptr && g_wifi != nullptr;
}

void handleStatus() {
  if (!runtimeReady()) {
    sendError(HttpStatus::kServiceUnavailable, "unsafe", "Runtime not ready");
    return;
  }
  const StatusSnapshot snapshot = g_ctx->status.read();
  DeviceStatusInputs in;
  in.wifi_connected = g_wifi->connected();
  in.snapshot = &snapshot;
  in.now_ms = millis();
  const std::string json = buildDeviceStatusJson(in);
  addCorsHeaders();
  g_server.send(200, "application/json", json.c_str());
}

void handlePour() {
  if (!runtimeReady()) {
    sendError(HttpStatus::kServiceUnavailable, "unsafe", "Runtime not ready");
    return;
  }
  if (rejectOversizedBody()) {
    return;
  }
  JsonDocument doc;
  if (deserializeJson(doc, g_server.arg("plain"))) {
    sendError(HttpStatus::kBadRequest, "bad_request", "Malformed JSON");
    return;
  }
  const char* recipe_id = doc["recipeId"] | "";
  if (recipe_id[0] == '\0') {
    sendError(HttpStatus::kUnprocessable, "bad_request", "recipeId required");
    return;
  }
  JsonArray steps_json = doc["steps"].as<JsonArray>();
  if (steps_json.isNull() || steps_json.size() == 0) {
    sendError(HttpStatus::kUnprocessable, "bad_request", "steps required");
    return;
  }
  if (steps_json.size() > kMaxPourSequenceSteps) {
    sendError(HttpStatus::kUnprocessable, "too_many_steps", "Too many steps");
    return;
  }

  PourSequenceCommand seq = {};
  const std::size_t recipe_len = std::strlen(recipe_id);
  if (recipe_len >= kRecipeIdMax) {
    sendError(HttpStatus::kUnprocessable, "bad_request", "recipeId too long");
    return;
  }
  std::memcpy(seq.recipe_id, recipe_id, recipe_len);

  uint8_t idx = 0;
  for (JsonObject step : steps_json) {
    const char* ingredient = step["ingredientId"] | "";
    const float ml = step["ml"] | 0.0f;
    if (ingredient[0] == '\0' || !(ml > 0.0f)) {
      sendError(HttpStatus::kUnprocessable, "bad_ml", "Invalid step");
      return;
    }
    const std::size_t len = std::strlen(ingredient);
    if (len >= kIngredientIdMax) {
      sendError(HttpStatus::kUnprocessable, "bad_ingredient", "ingredientId too long");
      return;
    }
    std::memcpy(seq.steps[idx].ingredient_id, ingredient, len);
    seq.steps[idx].ml = ml;
    ++idx;
  }
  seq.step_count = idx;

  const StatusSnapshot status = g_ctx->status.read();
  const CommandReject reject = preflightPourSequenceEnqueue(seq, status, PumpBus::kNumChannels);
  if (reject != CommandReject::kNone) {
    sendError(httpStatusForReject(reject), httpErrorCode(reject), httpMessageForReject(reject));
    return;
  }

  const bool ok = g_ctx->queue.enqueuePourSequence(seq);
  const CommandReject busy = rejectFromEnqueue(ok);
  if (busy != CommandReject::kNone) {
    sendError(httpStatusForReject(busy), httpErrorCode(busy), httpMessageForReject(busy));
    return;
  }
  sendNoContent();
}

void handlePourCancel() {
  if (!runtimeReady()) {
    sendError(HttpStatus::kServiceUnavailable, "unsafe", "Runtime not ready");
    return;
  }
  g_ctx->queue.enqueueCancel();
  sendNoContent();
}

void handlePourAck() {
  sendNoContent();
}

void handlePumpDispense() {
  if (!runtimeReady()) {
    sendError(HttpStatus::kServiceUnavailable, "unsafe", "Runtime not ready");
    return;
  }
  if (rejectOversizedBody()) {
    return;
  }
  JsonDocument doc;
  if (deserializeJson(doc, g_server.arg("plain"))) {
    sendError(HttpStatus::kBadRequest, "bad_request", "Malformed JSON");
    return;
  }
  const int pump_id = doc["pumpId"] | 0;
  const char* purpose = doc["purpose"] | "";
  if (pump_id < 1 || pump_id > static_cast<int>(PumpBus::kNumChannels)) {
    sendError(HttpStatus::kUnprocessable, "bad_pump", "Invalid pump id");
    return;
  }
  const uint8_t channel = static_cast<uint8_t>(pump_id - 1);
  const StatusSnapshot status = g_ctx->status.read();

  if (std::strcmp(purpose, "flush") == 0 || std::strcmp(purpose, "sanitize") == 0 ||
      std::strcmp(purpose, "drain") == 0) {
    sendError(HttpStatus::kNotImplemented, "not_implemented", "Cleaning sequences deferred");
    return;
  }

  if (std::strcmp(purpose, "prime") == 0) {
    const CommandReject reject = preflightPrimeEnqueue(channel, status, PumpBus::kNumChannels);
    if (reject != CommandReject::kNone) {
      sendError(httpStatusForReject(reject), httpErrorCode(reject), httpMessageForReject(reject));
      return;
    }
    PrimeCommand prime;
    prime.channel = channel;
    if (!g_ctx->queue.enqueuePrime(prime)) {
      sendError(HttpStatus::kConflict, "busy", "Device busy");
      return;
    }
    sendNoContent();
    return;
  }

  DispenseCommand dispense = {};
  dispense.channel = channel;
  dispense.flow_gate = false;

  if (std::strcmp(purpose, "verify") == 0) {
    dispense.ml = doc["ml"] | 0.0f;
    dispense.flow_gate = true;
    dispense.pump_job_purpose = static_cast<uint8_t>(PumpJobPurposeWire::kVerify);
    dispense.pump_job_target_ml = dispense.ml;
  } else if (std::strcmp(purpose, "calibration") == 0) {
    const float duration_s = doc["durationSeconds"] | 0.0f;
    if (!(duration_s > 0.0f) || duration_s > 120.0f) {
      sendError(HttpStatus::kUnprocessable, "bad_ml", "durationSeconds required");
      return;
    }
    const float ml_per_s = snapshotMlPerSecond(status, channel);
    dispense.ml = ml_per_s * duration_s;
    dispense.pump_job_purpose = static_cast<uint8_t>(PumpJobPurposeWire::kCalibration);
    dispense.pump_job_duration_ms = static_cast<unsigned long>(duration_s * 1000.0f);
  } else {
    sendError(HttpStatus::kUnprocessable, "bad_request", "Unknown purpose");
    return;
  }

  dispense.ml_per_s = snapshotMlPerSecond(status, channel);
  dispense.anti_drip_ms = 0;
  for (uint8_t i = 0; i < status.published_pump_count; ++i) {
    if (status.published_pumps[i].pump_id == channel + 1) {
      dispense.anti_drip_ms = status.published_pumps[i].anti_drip_ms;
      break;
    }
  }

  const CommandReject reject = preflightDispenseEnqueue(dispense, status, PumpBus::kNumChannels);
  if (reject != CommandReject::kNone) {
    sendError(httpStatusForReject(reject), httpErrorCode(reject), httpMessageForReject(reject));
    return;
  }

  unsigned long pour_ms = 0;
  computePourDurationMs(dispense, PumpBus::kNumChannels, dispense.ml_per_s, &pour_ms, nullptr);
  if (dispense.pump_job_duration_ms == 0) {
    dispense.pump_job_duration_ms = pour_ms;
  }

  if (!g_ctx->queue.enqueueDispense(dispense)) {
    sendError(HttpStatus::kConflict, "busy", "Device busy");
    return;
  }
  sendNoContent();
}

void handlePumpDispenseCancel() {
  if (!runtimeReady()) {
    sendError(HttpStatus::kServiceUnavailable, "unsafe", "Runtime not ready");
    return;
  }
  const StatusSnapshot status = g_ctx->status.read();
  if (status.job_busy && status.job_phase == static_cast<uint8_t>(Coordinator::Phase::kPrime)) {
    if (!g_ctx->queue.enqueuePrimeStop()) {
      sendError(HttpStatus::kConflict, "busy", "Device busy");
      return;
    }
  } else {
    g_ctx->queue.enqueueCancel();
  }
  sendNoContent();
}

void enqueueConfigOp(const ConfigOp& op) {
  if (!runtimeReady()) {
    sendError(HttpStatus::kServiceUnavailable, "unsafe", "Runtime not ready");
    return;
  }
  if (g_ctx->config_queue.hasPending()) {
    sendError(HttpStatus::kConflict, "busy", "Device busy");
    return;
  }
  const StatusSnapshot status = g_ctx->status.read();
  const ConfigOpReject reject = preflightConfigOpEnqueue(op, status, PumpBus::kNumChannels);
  if (reject != ConfigOpReject::kNone) {
    sendError(httpStatusForConfigReject(reject), httpErrorCodeConfig(reject),
              reject == ConfigOpReject::kBusy ? "Device busy" : "Request rejected");
    return;
  }
  if (!g_ctx->config_queue.enqueue(op)) {
    sendError(HttpStatus::kConflict, "busy", "Device busy");
    return;
  }
  sendNoContent();
}

bool parseInventoryBody(JsonDocument& doc) {
  if (rejectOversizedBody()) {
    return false;
  }
  if (deserializeJson(doc, g_server.arg("plain"))) {
    sendError(HttpStatus::kBadRequest, "bad_request", "Malformed JSON");
    return false;
  }
  return true;
}

void copyIngredientId(ConfigOp& op, const char* ingredient) {
  std::strncpy(op.ingredient_id, ingredient, kIngredientIdMax - 1);
  op.ingredient_id[kIngredientIdMax - 1] = '\0';
}

void handleInventoryRefill() {
  JsonDocument doc;
  if (!parseInventoryBody(doc)) {
    return;
  }
  ConfigOp op = {};
  op.type = ConfigOpType::kInventoryRefill;
  copyIngredientId(op, doc["ingredientId"] | "");
  enqueueConfigOp(op);
}

void handleInventoryBottleSize() {
  JsonDocument doc;
  if (!parseInventoryBody(doc)) {
    return;
  }
  ConfigOp op = {};
  op.type = ConfigOpType::kInventoryBottleSize;
  copyIngredientId(op, doc["ingredientId"] | "");
  op.inventory_ml = doc["bottleSizeMl"] | 0.0f;
  enqueueConfigOp(op);
}

void handleInventoryLevel() {
  JsonDocument doc;
  if (!parseInventoryBody(doc)) {
    return;
  }
  ConfigOp op = {};
  op.type = ConfigOpType::kInventoryLevel;
  copyIngredientId(op, doc["ingredientId"] | "");
  op.inventory_ml = doc["remainingMl"] | -1.0f;
  enqueueConfigOp(op);
}

void handleInventoryPrimed() {
  JsonDocument doc;
  if (!parseInventoryBody(doc)) {
    return;
  }
  ConfigOp op = {};
  op.type = ConfigOpType::kInventoryPrimed;
  copyIngredientId(op, doc["ingredientId"] | "");
  op.inventory_bool = doc["primed"] | false;
  enqueueConfigOp(op);
}

void handlePumpBinding() {
  if (rejectOversizedBody()) {
    return;
  }
  JsonDocument doc;
  if (deserializeJson(doc, g_server.arg("plain"))) {
    sendError(HttpStatus::kBadRequest, "bad_request", "Malformed JSON");
    return;
  }
  const int pump_id = doc["pumpId"] | 0;
  if (pump_id < 1 || pump_id > static_cast<int>(PumpBus::kNumChannels)) {
    sendError(HttpStatus::kUnprocessable, "bad_pump", "Invalid pump id");
    return;
  }
  ConfigOp op = {};
  op.channel = static_cast<uint8_t>(pump_id - 1);
  if (doc["ingredientId"].isNull()) {
    op.type = ConfigOpType::kClearBinding;
  } else {
    const char* ingredient = doc["ingredientId"] | "";
    const std::size_t len = std::strlen(ingredient);
    if (len == 0 || len >= kIngredientIdMax) {
      sendError(HttpStatus::kUnprocessable, "bad_ingredient", "Invalid ingredient");
      return;
    }
    op.type = ConfigOpType::kSetBinding;
    std::memcpy(op.ingredient_id, ingredient, len);
  }
  enqueueConfigOp(op);
}

void handlePumpCalibration() {
  if (rejectOversizedBody()) {
    return;
  }
  JsonDocument doc;
  if (deserializeJson(doc, g_server.arg("plain"))) {
    sendError(HttpStatus::kBadRequest, "bad_request", "Malformed JSON");
    return;
  }
  const int pump_id = doc["pumpId"] | 0;
  const float ml_per_s = doc["mlPerSecond"] | 0.0f;
  const uint32_t anti_drip = doc["antiDripMs"] | static_cast<uint32_t>(kDefaultAntiDripMs);
  if (pump_id < 1 || pump_id > static_cast<int>(PumpBus::kNumChannels)) {
    sendError(HttpStatus::kUnprocessable, "bad_pump", "Invalid pump id");
    return;
  }
  ConfigOp op = {};
  op.type = ConfigOpType::kSetCalibration;
  op.channel = static_cast<uint8_t>(pump_id - 1);
  op.ml_per_s = ml_per_s;
  op.anti_drip_ms = anti_drip;
  op.has_anti_drip = true;
  enqueueConfigOp(op);
}

void handleNotFound() {
  sendError(HttpStatus::kNotFound, "not_found", "Not found");
}

}  // namespace

void beginHttpServer(RuntimeContext& ctx, WiFiManager& wifi) {
  g_ctx = &ctx;
  g_wifi = &wifi;

  g_server.on("/status", HTTP_GET, handleStatus);
  g_server.on("/pour", HTTP_POST, handlePour);
  g_server.on("/pour/cancel", HTTP_POST, handlePourCancel);
  g_server.on("/pour/ack", HTTP_POST, handlePourAck);
  g_server.on("/pumps/dispense", HTTP_POST, handlePumpDispense);
  g_server.on("/pumps/dispense/cancel", HTTP_POST, handlePumpDispenseCancel);
  g_server.on("/pumps/binding", HTTP_POST, handlePumpBinding);
  g_server.on("/pumps/calibration", HTTP_POST, handlePumpCalibration);
  g_server.on("/inventory/refill", HTTP_POST, handleInventoryRefill);
  g_server.on("/inventory/bottle-size", HTTP_POST, handleInventoryBottleSize);
  g_server.on("/inventory/level", HTTP_POST, handleInventoryLevel);
  g_server.on("/inventory/primed", HTTP_POST, handleInventoryPrimed);

  g_server.onNotFound(handleNotFound);
  g_server.on("*", HTTP_OPTIONS, handleOptions);

  g_server.begin();
}

void handleHttpClients() {
  g_server.handleClient();
}
