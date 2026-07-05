import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SetupGate } from '@/components/kiosk/setup-gate';
import { useSetSetupReturn } from '@/hooks/use-setup-return';
import { resetSetupPinLockSuspensionForTests } from '@/lib/setup-pin-suspend';
import { renderWithProviders } from '@/test/render';

function SetupGateWithReturn({
  returnTo,
  children,
}: {
  returnTo: string;
  children: React.ReactNode;
}) {
  const setReturnTo = useSetSetupReturn();
  useEffect(() => {
    setReturnTo(returnTo);
  }, [returnTo, setReturnTo]);

  return <SetupGate>{children}</SetupGate>;
}

const { hasSetupUnlock, grantSetupUnlock, navigate } = vi.hoisted(() => ({
  hasSetupUnlock: vi.fn(() => false),
  grantSetupUnlock: vi.fn(),
  navigate: vi.fn(),
}));

let deviceStatus: { pumpJob: { state: string } | null } | undefined = {
  pumpJob: null,
};

vi.mock('wouter', () => ({
  useLocation: () => ['/setup/pumps', navigate],
}));

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
}));

vi.mock('@/lib/config', () => ({
  isSetupPinConfigured: () => true,
  verifySetupPin: (input: string) => input === '1234',
}));

vi.mock('@/lib/setup-unlock', () => ({
  hasSetupUnlock,
  grantSetupUnlock,
}));

describe('SetupGate', () => {
  beforeEach(() => {
    hasSetupUnlock.mockReturnValue(false);
    grantSetupUnlock.mockReset();
    grantSetupUnlock.mockImplementation(() => {
      hasSetupUnlock.mockReturnValue(true);
    });
    deviceStatus = { pumpJob: null };
    navigate.mockReset();
    resetSetupPinLockSuspensionForTests();
    sessionStorage.clear();
  });

  it('renders children when setup is already unlocked', () => {
    hasSetupUnlock.mockReturnValue(true);

    const { getByText, queryByText } = renderWithProviders(
      <SetupGate>
        <div>Setup content</div>
      </SetupGate>,
      { withSetupReturn: true },
    );

    expect(getByText('Setup content')).toBeInTheDocument();
    expect(queryByText('Setup PIN')).not.toBeInTheDocument();
  });

  it('shows the PIN dialog when setup is locked', () => {
    const { getByText } = renderWithProviders(
      <SetupGate>
        <div>Setup content</div>
      </SetupGate>,
      { withSetupReturn: true },
    );

    expect(getByText('Setup PIN')).toBeInTheDocument();
    expect(
      getByText('Enter the 4-digit PIN to access machine setup.'),
    ).toBeInTheDocument();
  });

  it('unlocks and shows children after the operator enters the correct PIN', async () => {
    const user = userEvent.setup();

    const { getByRole, getByText } = renderWithProviders(
      <SetupGate>
        <div>Setup content</div>
      </SetupGate>,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: '3' }));
    await user.click(getByRole('button', { name: '4' }));

    expect(getByText('Setup content')).toBeInTheDocument();
  });

  it('navigates to the return path when the operator cancels the PIN dialog', async () => {
    const user = userEvent.setup();

    const { getByRole } = renderWithProviders(
      <SetupGate>
        <div>Setup content</div>
      </SetupGate>,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: 'Cancel' }));

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('navigates to the remembered guest path when canceling from setup', async () => {
    const user = userEvent.setup();

    const { getByRole } = renderWithProviders(
      <SetupGateWithReturn returnTo="/drink/old-fashioned">
        <div>Setup content</div>
      </SetupGateWithReturn>,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: 'Cancel' }));

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/drink/old-fashioned');
  });

  it('defers re-locking while a pump job is running', () => {
    hasSetupUnlock.mockReturnValue(true);

    const { rerender, getByText, queryByText } = renderWithProviders(
      <SetupGate>
        <div>Setup content</div>
      </SetupGate>,
      { withSetupReturn: true },
    );

    expect(getByText('Setup content')).toBeInTheDocument();

    hasSetupUnlock.mockReturnValue(false);
    deviceStatus = { pumpJob: { state: 'running' } };

    rerender(
      <SetupGate>
        <div>Setup content</div>
      </SetupGate>,
    );

    expect(getByText('Setup content')).toBeInTheDocument();
    expect(queryByText('Setup PIN')).not.toBeInTheDocument();
  });

  it('re-locks setup when the unlock session expires', async () => {
    vi.useFakeTimers();
    hasSetupUnlock.mockReturnValue(true);

    const { getByText, queryByText } = renderWithProviders(
      <SetupGate>
        <div>Setup content</div>
      </SetupGate>,
      { withSetupReturn: true },
    );

    expect(getByText('Setup content')).toBeInTheDocument();

    hasSetupUnlock.mockReturnValue(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(queryByText('Setup PIN')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
