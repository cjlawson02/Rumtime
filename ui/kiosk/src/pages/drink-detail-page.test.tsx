import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { DrinkDetailPage } from '@/pages/drink-detail-page';
import { renderWithProviders } from '@/test/render';

const refresh = vi.fn();

const { navigate, routeId } = vi.hoisted(() => ({
  navigate: vi.fn(),
  routeId: { current: 'old-fashioned' },
}));

let deviceStatus: DeviceStatus | undefined;
let deviceError: string | null = null;
let loading = false;
let connected = true;

vi.mock('wouter', () => ({
  useRoute: (pattern: string) => {
    if (pattern === '/drink/:id') {
      return [true, { id: routeId.current }];
    }
    return [false, null];
  },
  useLocation: () => [`/drink/${routeId.current}`, navigate],
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

vi.mock('@/lib/config', () => ({
  isSetupPinConfigured: () => true,
  verifySetupPin: (input: string) => input === '1234',
}));

vi.mock('@/lib/setup-unlock', () => ({
  grantSetupUnlock: vi.fn(),
}));

const pourReadyDevice: DeviceStatus = {
  connected: true,
  bindings: {
    bourbon: {
      ingredientId: 'bourbon',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    simple: {
      ingredientId: 'simple',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  pumps: [
    { pumpId: 1, ingredientId: 'bourbon' },
    { pumpId: 2, ingredientId: 'simple' },
  ],
};

const lowInventoryDevice: DeviceStatus = {
  ...pourReadyDevice,
  bindings: {
    ...pourReadyDevice.bindings,
    bourbon: {
      ingredientId: 'bourbon',
      remainingMl: 5,
      bottleSizeMl: 750,
      primed: true,
    },
  },
};

const unboundDevice: DeviceStatus = {
  connected: true,
  bindings: {
    simple: {
      ingredientId: 'simple',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  pumps: [{ pumpId: 2, ingredientId: 'simple' }],
};

describe('DrinkDetailPage', () => {
  beforeEach(() => {
    routeId.current = 'old-fashioned';
    navigate.mockReset();
    refresh.mockReset();
    deviceStatus = pourReadyDevice;
    deviceError = null;
    loading = false;
    connected = true;
  });

  it('shows "Drink not found" for unknown recipe id', () => {
    routeId.current = 'missing-drink';

    const { getByText, getByRole } = renderWithProviders(<DrinkDetailPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Drink not found.')).toBeInTheDocument();
    expect(getByRole('link', { name: 'Back to menu' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('shows drink name and ingredients when device status is loaded', () => {
    const { getByRole, getByText } = renderWithProviders(<DrinkDetailPage />, {
      withSetupReturn: true,
    });

    expect(getByRole('heading', { name: 'Old Fashioned' })).toBeInTheDocument();
    expect(getByText('Bourbon')).toBeInTheDocument();
    expect(getByText('Simple syrup')).toBeInTheDocument();
    expect(getByText('Angostura bitters')).toBeInTheDocument();
    expect(getByText('Dispensed for you')).toBeInTheDocument();
    expect(getByText('You add manually')).toBeInTheDocument();
  });

  it('navigates to the pour route when Make it is clicked and drink is available', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderWithProviders(<DrinkDetailPage />, {
      withSetupReturn: true,
    });

    await user.click(getByRole('button', { name: 'Make it' }));

    expect(navigate).toHaveBeenCalledWith('/pour/old-fashioned');
  });

  it('shows refill CTA and inventory badges when inventory is low', () => {
    deviceStatus = lowInventoryDevice;

    const { getByRole, getByText, queryByRole } = renderWithProviders(
      <DrinkDetailPage />,
      { withSetupReturn: true },
    );

    expect(getByRole('button', { name: 'Refill Bourbon' })).toBeInTheDocument();
    expect(getByText('Needs refill')).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Make it' })).not.toBeInTheDocument();
  });

  it('shows bottle bay entry when a pumped ingredient is unbound', () => {
    deviceStatus = unboundDevice;

    const { getByRole, getByText, queryByRole } = renderWithProviders(
      <DrinkDetailPage />,
      { withSetupReturn: true },
    );

    expect(
      getByRole('link', { name: 'Open bottle bay' }),
    ).toHaveAttribute('href', '/setup/pumps');
    expect(getByText('Not connected')).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Make it' })).not.toBeInTheDocument();
  });

  it('opens the setup PIN dialog and navigates to bottle bay after refill', async () => {
    const user = userEvent.setup();
    deviceStatus = lowInventoryDevice;

    const { getByRole, getByText } = renderWithProviders(<DrinkDetailPage />, {
      withSetupReturn: true,
    });

    await user.click(getByRole('button', { name: 'Refill Bourbon' }));

    expect(getByText('Enter the setup PIN to continue.')).toBeInTheDocument();

    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: '3' }));
    await user.click(getByRole('button', { name: '4' }));

    expect(
      getByText('Refill the bottle in setup, or pour with what is left anyway.'),
    ).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Refill in bottle bay' }));

    expect(navigate).toHaveBeenCalledWith('/setup/pumps');
  });

  it('navigates to pour anyway when chosen from the inventory dialog', async () => {
    const user = userEvent.setup();
    deviceStatus = lowInventoryDevice;

    const { getByRole } = renderWithProviders(<DrinkDetailPage />, {
      withSetupReturn: true,
    });

    await user.click(getByRole('button', { name: 'Refill Bourbon' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: '3' }));
    await user.click(getByRole('button', { name: '4' }));
    await user.click(getByRole('button', { name: 'Pour anyway' }));

    expect(navigate).toHaveBeenCalledWith('/pour/old-fashioned');
  });

  it('shows loading while device status is being fetched', () => {
    loading = true;
    deviceStatus = undefined;

    const { getByText } = renderWithProviders(<DrinkDetailPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Loading device status…')).toBeInTheDocument();
  });

  it('shows pour error when pouring while the device is offline', async () => {
    const user = userEvent.setup();
    deviceStatus = lowInventoryDevice;
    deviceError = 'Connection lost';

    const { getAllByRole, getByRole, getByText } = renderWithProviders(
      <DrinkDetailPage />,
      { withSetupReturn: true },
    );

    expect(getByText('Device offline')).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Refill Bourbon' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: '3' }));
    await user.click(getByRole('button', { name: '4' }));
    await user.click(getByRole('button', { name: 'Pour anyway' }));

    const pourFailedAlert = getAllByRole('alert').find((alert) =>
      alert.textContent.includes('Pour failed'),
    );
    expect(pourFailedAlert).toHaveTextContent('Connection lost');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows unreachable device screen with retry when status never loads', async () => {
    const user = userEvent.setup();
    deviceStatus = undefined;
    deviceError = 'Network error';

    const { getByRole, getByText } = renderWithProviders(<DrinkDetailPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Network error')).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Retry' }));

    expect(refresh).toHaveBeenCalled();
  });
});
