import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { SetupDevicePage } from '@/pages/setup-device-page';
import { renderWithProviders } from '@/test/render';

const { setHostname, resetHostname } = vi.hoisted(() => ({
  setHostname: vi.fn(),
  resetHostname: vi.fn(),
}));

let deviceStatus: DeviceStatus | undefined;
let deviceError: string | null = null;
let loading = false;
let connected = true;
let hostname = 'rumtime.local';
let isOverridden = false;

vi.mock('@/lib/setup-unlock', () => ({
  hasSetupUnlock: () => true,
  grantSetupUnlock: vi.fn(),
}));

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({
    status: deviceStatus,
    error: deviceError,
    loading,
    connected,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-device-endpoint', () => ({
  useDeviceEndpoint: () => ({
    hostname,
    isOverridden,
    setHostname,
    resetHostname,
    defaultDeviceApiBase: 'http://rumtime.local',
  }),
}));

const connectedStatus: DeviceStatus = {
  connected: true,
  firmwareVersion: '1.2.3',
  link: {
    ssid: 'IoT',
    ip: '192.168.5.29',
    rssi: -61,
    lastDisconnectReason: 8,
    uptimeSeconds: 3725,
    freeHeap: 204800,
  },
  bindings: {},
  pumps: [],
};

describe('SetupDevicePage', () => {
  beforeEach(() => {
    deviceStatus = connectedStatus;
    deviceError = null;
    loading = false;
    connected = true;
    hostname = 'rumtime.local';
    isOverridden = false;
    setHostname.mockReset();
    resetHostname.mockReset();
  });

  it('shows connection status and firmware when connected', () => {
    const { getByText } = renderWithProviders(<SetupDevicePage />, {
      withSetupReturn: true,
    });

    expect(getByText('Machine status')).toBeInTheDocument();
    expect(getByText('Connected')).toBeInTheDocument();
    expect(getByText('1.2.3')).toBeInTheDocument();
    expect(getByText('rumtime.local')).toBeInTheDocument();
    expect(getByText('IoT')).toBeInTheDocument();
    expect(getByText('192.168.5.29')).toBeInTheDocument();
    expect(getByText('-61 dBm')).toBeInTheDocument();
    expect(getByText('1h 2m')).toBeInTheDocument();
    expect(getByText('200 KB')).toBeInTheDocument();
    expect(getByText('8 (assoc leave)')).toBeInTheDocument();
  });

  it('shows offline state and last error when disconnected', () => {
    connected = false;
    deviceStatus = undefined;
    deviceError = 'Network error';

    const { getByText } = renderWithProviders(<SetupDevicePage />, {
      withSetupReturn: true,
    });

    expect(getByText('Offline')).toBeInTheDocument();
    expect(getByText('Network error')).toBeInTheDocument();
  });

  it('saves a new IP address through the change flow', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderWithProviders(<SetupDevicePage />, {
      withSetupReturn: true,
    });

    await user.click(getByRole('button', { name: 'Change' }));

    const saveButton = getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '9' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: 'Dot' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '6' }));
    await user.click(getByRole('button', { name: '8' }));
    await user.click(getByRole('button', { name: 'Dot' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: 'Dot' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '0' }));

    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);

    expect(setHostname).toHaveBeenCalledWith('192.168.1.10');
  });
});
