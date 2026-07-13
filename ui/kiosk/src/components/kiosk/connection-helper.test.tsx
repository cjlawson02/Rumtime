import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionHelper } from '@/components/kiosk/connection-helper';
import { renderWithProviders } from '@/test/render';

const { refresh, setHostname, resetHostname } = vi.hoisted(() => ({
  refresh: vi.fn(),
  setHostname: vi.fn(),
  resetHostname: vi.fn(),
}));

let deviceError: string | null = null;
let loading = false;
let connected = true;
let hostname = 'rumtime.local';
let isOverridden = false;

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({
    status: null,
    error: deviceError,
    loading,
    connected,
    refresh,
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

describe('ConnectionHelper', () => {
  beforeEach(() => {
    deviceError = null;
    loading = false;
    connected = true;
    hostname = 'rumtime.local';
    isOverridden = false;
    refresh.mockReset();
    refresh.mockResolvedValue(undefined);
    setHostname.mockReset();
    resetHostname.mockReset();
  });

  it('stays hidden while connected', () => {
    const { queryByText } = renderWithProviders(<ConnectionHelper />);

    expect(queryByText('Device offline')).not.toBeInTheDocument();
  });

  it('stays hidden while the first status check is loading', () => {
    loading = true;
    connected = false;

    const { queryByText } = renderWithProviders(<ConnectionHelper />);

    expect(queryByText('Device offline')).not.toBeInTheDocument();
  });

  it('opens a non-dismissible helper when disconnected', () => {
    connected = false;
    deviceError = 'Network error';

    const { getByText, getByRole } = renderWithProviders(<ConnectionHelper />);

    expect(getByText('Device offline')).toBeInTheDocument();
    expect(getByText(/rumtime\.local/)).toBeInTheDocument();
    expect(getByText('Network error')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      getByRole('button', { name: 'Change IP address' }),
    ).toBeInTheDocument();
  });

  it('retries status when Retry is pressed', async () => {
    const user = userEvent.setup();
    connected = false;

    const { getByRole } = renderWithProviders(<ConnectionHelper />);

    await user.click(getByRole('button', { name: 'Retry' }));

    expect(refresh).toHaveBeenCalledWith({ force: true });
  });

  it('saves a new IP address from the inline pad', async () => {
    const user = userEvent.setup();
    connected = false;

    const { getByRole } = renderWithProviders(<ConnectionHelper />);

    await user.click(getByRole('button', { name: 'Change IP address' }));
    expect(getByRole('heading', { name: 'IP address' })).toBeInTheDocument();

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
    await user.click(getByRole('button', { name: '4' }));
    await user.click(getByRole('button', { name: '2' }));

    await user.click(getByRole('button', { name: 'Save' }));

    expect(setHostname).toHaveBeenCalledWith('192.168.1.42');
  });

  it('offers reset when an IP override is active', async () => {
    const user = userEvent.setup();
    connected = false;
    isOverridden = true;
    hostname = '192.168.1.42';

    const { getByRole, getByText } = renderWithProviders(<ConnectionHelper />);

    expect(getByText(/Overriding build default/)).toBeInTheDocument();
    await user.click(getByRole('button', { name: 'Reset to default' }));
    expect(resetHostname).toHaveBeenCalledOnce();
  });
});
