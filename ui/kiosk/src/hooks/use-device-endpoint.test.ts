import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDeviceEndpoint } from "@/hooks/use-device-endpoint";
import { createWrapper } from "@/test/render";

describe("useDeviceEndpoint", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns the default hostname when no override is stored", () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useDeviceEndpoint(), {
      wrapper: createWrapper({ queryClient }),
    });

    expect(result.current.isOverridden).toBe(false);
    expect(result.current.hostname).toBe("rumtime.local");
  });

  it("persists a hostname override and clears status cache", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "removeQueries");
    const { result } = renderHook(() => useDeviceEndpoint(), {
      wrapper: createWrapper({ queryClient }),
    });

    act(() => {
      result.current.setHostname("192.168.1.42");
    });

    expect(result.current.isOverridden).toBe(true);
    expect(result.current.hostname).toBe("192.168.1.42");
    expect(invalidateSpy).toHaveBeenCalled();

    act(() => {
      result.current.resetHostname();
    });

    expect(result.current.isOverridden).toBe(false);
    expect(result.current.hostname).toBe("rumtime.local");
  });
});
