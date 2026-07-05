import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { MenuPage } from '@/pages/menu-page';
import { renderWithProviders } from '@/test/render';

const refresh = vi.fn();

let deviceStatus: DeviceStatus | undefined;
let deviceError: string | null = null;
let loading = false;
let connected = true;

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({
    status: deviceStatus,
    error: deviceError,
    loading,
    connected,
    refresh,
  }),
}));

vi.mock('@/hooks/use-device-endpoint', () => ({
  useDeviceEndpoint: () => ({
    hostname: 'rumtime.local',
  }),
}));

const stockedDevice: DeviceStatus = {
  connected: true,
  bindings: {
    bourbon: {
      ingredientId: 'bourbon',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    tequila: {
      ingredientId: 'tequila',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    triple_sec: {
      ingredientId: 'triple_sec',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    lime: {
      ingredientId: 'lime',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    gin: {
      ingredientId: 'gin',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    rum: {
      ingredientId: 'rum',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    vodka: {
      ingredientId: 'vodka',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  pumps: [
    { pumpId: 1, ingredientId: 'bourbon' },
    { pumpId: 2, ingredientId: 'tequila' },
    { pumpId: 3, ingredientId: 'gin' },
    { pumpId: 4, ingredientId: 'rum' },
    { pumpId: 5, ingredientId: 'vodka' },
  ],
};

describe('MenuPage', () => {
  beforeEach(() => {
    refresh.mockReset();
    deviceStatus = stockedDevice;
    deviceError = null;
    loading = false;
    connected = true;
  });

  it('lists available drinks when device status is known', () => {
    const { getByText } = renderWithProviders(<MenuPage />, {
      withMenuCategory: true,
      withSetupReturn: true,
    });

    expect(getByText('Home bar')).toBeInTheDocument();
    expect(getByText(/Connected · rumtime.local/)).toBeInTheDocument();
    expect(getByText('Old Fashioned')).toBeInTheDocument();
    expect(getByText(/drinks/)).toBeInTheDocument();
  });

  it('filters drinks by spirit category', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText, queryByText } = renderWithProviders(
      <MenuPage />,
      { withMenuCategory: true, withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: 'Whiskey' }));

    expect(getByText('Old Fashioned')).toBeInTheDocument();
    expect(queryByText('Margarita')).not.toBeInTheDocument();
    expect(getByText(/drinks · .*Whiskey/)).toBeInTheDocument();
  });

  it('shows an offline retry banner when status cannot be loaded', async () => {
    const user = userEvent.setup();
    deviceStatus = undefined;
    deviceError = 'Network error';
    connected = false;

    const { getByText, getByRole } = renderWithProviders(<MenuPage />, {
      withMenuCategory: true,
      withSetupReturn: true,
    });

    expect(getByText('Device unreachable')).toBeInTheDocument();
    expect(getByText('Device offline')).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('shows a connecting badge while device status is loading', () => {
    loading = true;
    deviceStatus = undefined;

    const { getByText } = renderWithProviders(<MenuPage />, {
      withMenuCategory: true,
      withSetupReturn: true,
    });

    expect(getByText('Connecting…')).toBeInTheDocument();
  });
});
