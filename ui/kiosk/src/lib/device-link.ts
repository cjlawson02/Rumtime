/** Common Espressif wifi_err_reason_t values for Machine status. */
const WIFI_DISCONNECT_LABELS: Record<number, string> = {
  1: 'unspecified',
  2: 'auth expire',
  3: 'auth leave',
  4: 'assoc expire',
  5: 'assoc toomany',
  6: 'not auth',
  7: 'not assoc',
  8: 'assoc leave',
  15: '4-way handshake timeout',
  200: 'beacon timeout',
  201: 'no AP found',
  202: 'auth fail',
  203: 'assoc fail',
  204: 'handshake timeout',
  205: 'connection fail',
};

export function formatWifiRssi(rssi: number | undefined): string {
  if (rssi === undefined || rssi === 0) return '—';
  return `${rssi} dBm`;
}

export function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatFreeHeap(bytes: number | undefined): string {
  if (bytes === undefined) return '—';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

export function formatDisconnectReason(reason: number | undefined): string {
  if (reason === undefined || reason === 0) return 'None';
  const label = WIFI_DISCONNECT_LABELS[reason];
  return label ? `${reason} (${label})` : String(reason);
}
