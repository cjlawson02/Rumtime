import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { SetupCleaningPage } from '@/pages/setup-cleaning-page';
import { renderWithProviders } from '@/test/render';

let deviceStatus: DeviceStatus | undefined;

vi.mock('@/lib/setup-unlock', () => ({
  hasSetupUnlock: () => true,
  grantSetupUnlock: vi.fn(),
}));

vi.mock('@/components/kiosk/cleaning-wizard', () => ({
  CleaningWizard: ({
    open,
    mode,
    pumpIds,
    onComplete,
    onOpenChange,
  }: {
    open: boolean;
    mode: 'session' | 'line';
    pumpIds: number[];
    onComplete?: (updates: Record<number, string>) => void;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="cleaning-wizard">
        {mode} clean for lines {pumpIds.join(', ')}
        <button
          type="button"
          onClick={() => onComplete?.({ [pumpIds[0]!]: 'flushed' })}
        >
          Complete flush
        </button>
        <button
          type="button"
          onClick={() => onComplete?.({ [pumpIds[0]!]: 'sanitized' })}
        >
          Complete sanitize
        </button>
        <button
          type="button"
          onClick={() => onComplete?.({ [pumpIds[0]!]: 'done' })}
        >
          Complete clean
        </button>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close wizard
        </button>
      </div>
    ) : null,
}));

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
}));

const cleaningStatus: DeviceStatus = {
  connected: true,
  bindings: {
    bourbon: {
      ingredientId: 'bourbon',
      remainingMl: 500,
      bottleSizeMl: 750,
      primed: true,
    },
    simple: {
      ingredientId: 'simple',
      remainingMl: 400,
      bottleSizeMl: 750,
      primed: false,
    },
  },
  pumps: [
    { pumpId: 1, ingredientId: 'bourbon' },
    { pumpId: 2, ingredientId: 'simple' },
  ],
};

describe('SetupCleaningPage', () => {
  beforeEach(() => {
    deviceStatus = cleaningStatus;
  });

  it('lists lines with cleaning status badges', () => {
    const { getByText, getAllByText } = renderWithProviders(
      <SetupCleaningPage />,
      { withSetupReturn: true },
    );

    expect(getByText('Line cleaning')).toBeInTheDocument();
    expect(getByText('Line 1')).toBeInTheDocument();
    expect(getByText('Line 2')).toBeInTheDocument();
    expect(getAllByText('Not cleaned').length).toBe(2);
  });

  it('opens the session cleaning wizard', async () => {
    const user = userEvent.setup();
    const { getByRole, getByTestId } = renderWithProviders(
      <SetupCleaningPage />,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: 'Start session clean' }));

    expect(getByTestId('cleaning-wizard')).toHaveTextContent(
      'session clean for lines 1, 2',
    );
  });

  it('opens the line cleaning wizard for one pump', async () => {
    const user = userEvent.setup();
    const { getAllByRole, getByTestId } = renderWithProviders(
      <SetupCleaningPage />,
      { withSetupReturn: true },
    );

    await user.click(getAllByRole('button', { name: 'Clean line' })[1]!);

    expect(getByTestId('cleaning-wizard')).toHaveTextContent(
      'line clean for lines 2',
    );
  });

  it('merges flushed status from the line cleaning wizard', async () => {
    const user = userEvent.setup();
    const { getAllByRole, getByRole, getByText } = renderWithProviders(
      <SetupCleaningPage />,
      { withSetupReturn: true },
    );

    await user.click(getAllByRole('button', { name: 'Clean line' })[0]!);
    await user.click(getByRole('button', { name: 'Complete flush' }));

    expect(getByText('Flushed')).toBeInTheDocument();
  });

  it('merges sanitized status after flush on the same line', async () => {
    const user = userEvent.setup();
    const { getAllByRole, getAllByText, getByRole } = renderWithProviders(
      <SetupCleaningPage />,
      { withSetupReturn: true },
    );

    await user.click(getAllByRole('button', { name: 'Clean line' })[0]!);
    await user.click(getByRole('button', { name: 'Complete flush' }));
    expect(getAllByText('Flushed').length).toBeGreaterThan(0);

    await user.click(getAllByRole('button', { name: 'Clean line' })[0]!);
    await user.click(getByRole('button', { name: 'Complete sanitize' }));
    expect(getAllByText('Sanitized').length).toBeGreaterThan(0);
  });

  it('marks a line clean when the wizard reports done', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = renderWithProviders(
      <SetupCleaningPage />,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: 'Start session clean' }));
    await user.click(getByRole('button', { name: 'Complete clean' }));

    expect(getByText('Clean')).toBeInTheDocument();
  });

  it('shows loading when device status is not ready', () => {
    deviceStatus = undefined;

    const { getByText } = renderWithProviders(<SetupCleaningPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Loading line cleaning…')).toBeInTheDocument();
  });

  it('closes the cleaning wizard from the mocked panel', async () => {
    const user = userEvent.setup();
    const { getByRole, getByTestId, queryByTestId } = renderWithProviders(
      <SetupCleaningPage />,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: 'Start session clean' }));
    expect(getByTestId('cleaning-wizard')).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Close wizard' }));

    expect(queryByTestId('cleaning-wizard')).not.toBeInTheDocument();
  });
});
