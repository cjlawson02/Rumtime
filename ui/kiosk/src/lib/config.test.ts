import { describe, expect, it, vi } from "vitest";

import { isSetupPinConfigured, kioskConfig, verifySetupPinValue } from "@/lib/config";

describe("setup pin config", () => {
  it("exposes the build-time setup pin through kioskConfig", () => {
    expect(typeof kioskConfig.setupPin).toBe("string");
    expect(isSetupPinConfigured()).toBe(kioskConfig.setupPin.length > 0);
  });

  it("accepts the configured pin", () => {
    expect(verifySetupPinValue("1234", "1234", false)).toBe(true);
    expect(verifySetupPinValue("0000", "1234", false)).toBe(false);
  });

  it("rejects any pin when unset in production", () => {
    expect(verifySetupPinValue("1234", "", false)).toBe(false);
  });

  it("allows any pin in dev when unset", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(verifySetupPinValue("anything", "", true)).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
