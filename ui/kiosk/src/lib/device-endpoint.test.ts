import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearDeviceApiBaseOverride,
  DEFAULT_DEVICE_API_BASE,
  deviceApiBaseFromIpv4,
  formatHostnameInput,
  getDeviceApiBase,
  readDeviceApiBaseOverride,
  setDeviceApiBaseOverride,
} from "@/lib/device-endpoint";

describe("deviceApiBaseFromIpv4", () => {
  it("builds an http base URL from a valid IPv4 address", () => {
    expect(deviceApiBaseFromIpv4("192.168.1.42")).toBe("http://192.168.1.42");
  });

  it("rejects non-IPv4 input", () => {
    expect(() => deviceApiBaseFromIpv4("rumtime.local")).toThrow("Enter a valid IP address");
  });
});

describe("formatHostnameInput", () => {
  it("returns hostname without scheme", () => {
    expect(formatHostnameInput("http://rumtime.local")).toBe("rumtime.local");
    expect(formatHostnameInput("http://192.168.0.10")).toBe("192.168.0.10");
  });
});

describe("device endpoint override storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("persists a valid IPv4 override in localStorage", () => {
    setDeviceApiBaseOverride("10.0.0.5");
    expect(readDeviceApiBaseOverride()).toBe("http://10.0.0.5");
    expect(getDeviceApiBase()).toBe("http://10.0.0.5");
  });

  it("rejects mDNS hostnames as overrides", () => {
    expect(() => setDeviceApiBaseOverride("rumtime.local")).toThrow("Enter a valid IP address");
    expect(readDeviceApiBaseOverride()).toBeNull();
  });

  it("clears invalid persisted overrides", () => {
    localStorage.setItem("rumtime.deviceApiBase", "http://not-an-ip");
    expect(readDeviceApiBaseOverride()).toBeNull();
    expect(localStorage.getItem("rumtime.deviceApiBase")).toBeNull();
  });

  it("falls back to the build default when not overridden", () => {
    clearDeviceApiBaseOverride();
    expect(getDeviceApiBase()).toBe(DEFAULT_DEVICE_API_BASE);
  });
});
