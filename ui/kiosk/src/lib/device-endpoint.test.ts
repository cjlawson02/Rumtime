import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearDeviceApiBaseOverride,
  DEFAULT_DEVICE_API_BASE,
  deviceApiBaseFromIpv4,
  formatHostnameInput,
  getDeviceApiBase,
  readDeviceApiBaseOverride,
  setDeviceApiBaseOverride,
} from '@/lib/device-endpoint';

function installBrowserStorageMock() {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  });

  vi.stubGlobal('window', {
    dispatchEvent: (event: Event) => {
      const handlers = listeners.get(event.type);
      handlers?.forEach((handler) => { handler(); });
      return true;
    },
    addEventListener: (type: string, handler: () => void) => {
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(handler);
      listeners.set(type, handlers);
    },
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler);
    },
  });
}

describe('deviceApiBaseFromIpv4', () => {
  it('builds an http base URL from a valid IPv4 address', () => {
    expect(deviceApiBaseFromIpv4('192.168.1.42')).toBe('http://192.168.1.42');
  });

  it('rejects non-IPv4 input', () => {
    expect(() => deviceApiBaseFromIpv4('rumtime.local')).toThrow(
      'Enter a valid IP address',
    );
  });
});

describe('formatHostnameInput', () => {
  it('returns hostname without scheme', () => {
    expect(formatHostnameInput('http://rumtime.local')).toBe('rumtime.local');
    expect(formatHostnameInput('http://192.168.0.10')).toBe('192.168.0.10');
  });
});

describe('device endpoint override storage', () => {
  beforeEach(() => {
    installBrowserStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists a valid IPv4 override in localStorage', () => {
    setDeviceApiBaseOverride('10.0.0.5');
    expect(readDeviceApiBaseOverride()).toBe('http://10.0.0.5');
    expect(getDeviceApiBase()).toBe('http://10.0.0.5');
  });

  it('rejects mDNS hostnames as overrides', () => {
    expect(() => setDeviceApiBaseOverride('rumtime.local')).toThrow(
      'Enter a valid IP address',
    );
  });

  it('clears invalid persisted overrides', () => {
    localStorage.setItem('rumtime.deviceApiBase', 'http://rumtime.local');
    expect(readDeviceApiBaseOverride()).toBeNull();
    expect(localStorage.getItem('rumtime.deviceApiBase')).toBeNull();
  });

  it('falls back to the build default when not overridden', () => {
    expect(getDeviceApiBase()).toBe(DEFAULT_DEVICE_API_BASE);
    clearDeviceApiBaseOverride();
    expect(getDeviceApiBase()).toBe(DEFAULT_DEVICE_API_BASE);
  });
});
