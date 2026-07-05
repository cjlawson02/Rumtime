/** Internal kiosk paths only — rejects external URLs and protocol handlers. */

const SAFE_INTERNAL_PATH =
  /^\/(?!\/)[a-zA-Z0-9/_.-]*(?:\?[a-zA-Z0-9_=&%-.]*)?$/;

export function sanitizeInternalPath(
  raw: string | null | undefined,
): string | undefined {
  if (!raw || raw.startsWith('//') || !SAFE_INTERNAL_PATH.test(raw)) {
    return undefined;
  }
  return raw;
}
