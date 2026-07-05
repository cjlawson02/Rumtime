import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { SetupCalibrationPage } from '@/pages/setup-calibration-page';
import { renderWithProviders } from '@/test/render';

let deviceStatus: DeviceStatus | undefined;

vi.mock('@/lib/setup-unlock', () => ({
  hasSetupUnlock: () => true,
  grantSetupUnlock: vi.fn(),
}));

vi.mock('@/components/kiosk/prime-wizard', () => ({
  PrimeWizard: ({
    open,
    pumpId,
    onOpenChange,
  }: {
    open: boolean;
    pumpId: number;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="prime-wizard">
        Prime wizard for pump {pumpId}
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close prime
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/kiosk/calibration-wizard', () => ({
  CalibrationWizard: ({
    open,
    pumpId,
    onOpenChange,
  }: {
    open: boolean;
    pumpId: number;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="calibration-wizard">
        Calibration wizard for pump {pumpId}
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close calibration
        </button>
      </div>
    ) : null,
}));

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
}));

const calibrationStatus: DeviceStatus = {
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
    { pumpId: 1, ingredientId: 'bourbon', mlPerSecond: 2, antiDripMs: 100 },
    { pumpId: 2, ingredientId: 'simple', mlPerSecond: 1.5, antiDripMs: 80 },
  ],
};

describe('SetupCalibrationPage', () => {
  beforeEach(() => {
    deviceStatus = calibrationStatus;
  });

  it('lists assigned lines with calibration metrics', () => {
    const { getByText } = renderWithProviders(<SetupCalibrationPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Pour tuning')).toBeInTheDocument();
    expect(getByText('Line 1')).toBeInTheDocument();
    expect(getByText('Line 2')).toBeInTheDocument();
    expect(getByText('Primed')).toBeInTheDocument();
    expect(getByText('Needs prime')).toBeInTheDocument();
    expect(getByText(/2\.00 ml\/s/)).toBeInTheDocument();
  });

  it('opens the prime wizard for a line', async () => {
    const user = userEvent.setup();
    const { getAllByRole, getByTestId } = renderWithProviders(
      <SetupCalibrationPage />,
      { withSetupReturn: true },
    );

    await user.click(getAllByRole('button', { name: 'Prime' })[0]!);

    expect(getByTestId('prime-wizard')).toHaveTextContent('pump 1');
  });

  it('opens the calibration wizard for a line', async () => {
    const user = userEvent.setup();
    const { getAllByRole, getByTestId } = renderWithProviders(
      <SetupCalibrationPage />,
      { withSetupReturn: true },
    );

    await user.click(getAllByRole('button', { name: 'Calibrate' })[0]!);

    expect(getByTestId('calibration-wizard')).toHaveTextContent('pump 1');
  });

  it('shows loading when device status is not ready', () => {
    deviceStatus = undefined;

    const { getByText } = renderWithProviders(<SetupCalibrationPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Loading pour tuning…')).toBeInTheDocument();
  });

  it('shows unassigned lines without prime or calibrate actions', () => {
    deviceStatus = {
      ...calibrationStatus,
      pumps: [
        { pumpId: 1, ingredientId: null },
        ...calibrationStatus.pumps,
      ],
    };

    const { getByText, queryAllByRole } = renderWithProviders(
      <SetupCalibrationPage />,
      { withSetupReturn: true },
    );

    expect(getByText('Unassigned')).toBeInTheDocument();
    expect(queryAllByRole('button', { name: 'Prime' })).toHaveLength(2);
  });

  it('closes the prime wizard from the mocked panel', async () => {
    const user = userEvent.setup();
    const { getAllByRole, getByTestId, queryByTestId } = renderWithProviders(
      <SetupCalibrationPage />,
      { withSetupReturn: true },
    );

    await user.click(getAllByRole('button', { name: 'Prime' })[0]!);
    expect(getByTestId('prime-wizard')).toBeInTheDocument();

    await user.click(getByTestId('prime-wizard').querySelector('button')!);

    expect(queryByTestId('prime-wizard')).not.toBeInTheDocument();
  });

  it('closes the calibration wizard from the mocked panel', async () => {
    const user = userEvent.setup();
    const { getAllByRole, getByTestId, queryByTestId } = renderWithProviders(
      <SetupCalibrationPage />,
      { withSetupReturn: true },
    );

    await user.click(getAllByRole('button', { name: 'Calibrate' })[0]!);
    expect(getByTestId('calibration-wizard')).toBeInTheDocument();

    await user.click(
      getByTestId('calibration-wizard').querySelector('button')!,
    );

    expect(queryByTestId('calibration-wizard')).not.toBeInTheDocument();
  });
});
