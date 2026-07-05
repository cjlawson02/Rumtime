import { isValidIpv4 } from '@/lib/ip-address';

/** Default dispenser base URL from build-time env (mDNS hostname — not overridable at runtime). */
export const DEFAULT_DEVICE_API_BASE =
  import.meta.env.VITE_DEVICE_API_BASE ?? 'http://rumtime.local';

/** Persisted IPv4 override — localStorage survives reloads on the kiosk tablet. */
const STORAGE_KEY = 'rumtime.deviceApiBase';
const ENDPOINT_CHANGE_EVENT = 'rumtime:device-endpoint-change';

export function deviceApiBaseFromIpv4(ipAddress: string): string {
  const trimmed = ipAddress.trim();
  if (!isValidIpv4(trimmed)) {
    throw new Error('Enter a valid IP address');
  }
  return `http://${trimmed}`;
}

/** Hostname (+ optional port) for display. */
export function formatHostnameInput(apiBase: string): string {
  try {
    const url = new URL(apiBase);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return apiBase.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

export function readDeviceApiBaseOverride(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const host = formatHostnameInput(raw);
    if (!isValidIpv4(host)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return deviceApiBaseFromIpv4(host);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getDeviceApiBase(): string {
  return readDeviceApiBaseOverride() ?? DEFAULT_DEVICE_API_BASE;
}

export function setDeviceApiBaseOverride(ipAddress: string): string {
  const normalized = deviceApiBaseFromIpv4(ipAddress);
  localStorage.setItem(STORAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent(ENDPOINT_CHANGE_EVENT));
  return normalized;
}

export function clearDeviceApiBaseOverride(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(ENDPOINT_CHANGE_EVENT));
}

export function subscribeDeviceEndpoint(onStoreChange: () => void): () => void {
  const handler = () => { onStoreChange(); };
  window.addEventListener(ENDPOINT_CHANGE_EVENT, handler);
  return () => { window.removeEventListener(ENDPOINT_CHANGE_EVENT, handler); };
}
