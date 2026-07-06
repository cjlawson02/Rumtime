#include "runtime_context.h"

RuntimeContext& runtimeContext() {
  static RuntimeContext ctx;
  return ctx;
}
