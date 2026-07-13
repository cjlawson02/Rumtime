import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  markPumpPourDispenseStarted,
  type PumpPourTracker,
} from '@/lib/pump-pour-lifecycle';
import { PrimeWizard } from '@/components/kiosk/prime-wizard';
import { renderWithProviders } from '@/test/render';
import {
  createMockPumpDispenseSession,
  runningPumpJob,
  wizardPumpStatus,
} from '@/test/wizard-mocks';

const updatePrimed = vi.fn();
const dispenseSession = createMockPumpDispenseSession();

let deviceStatus = wizardPumpStatus;

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
}));

vi.mock('@/hooks/use-device-mutations', () => ({
  useUpdatePrimed: () => ({ mutateAsync: updatePrimed }),
}));

vi.mock('@/hooks/use-pump-dispense-session', () => ({
  usePumpDispenseSession: () => dispenseSession,
}));

describe('PrimeWizard', () => {
  beforeEach(() => {
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    updatePrimed.mockReset();
    dispenseSession.startRun.mockClear();
    dispenseSession.emergencyStop.mockClear();
    dispenseSession.stopRun.mockClear();
    dispenseSession.closeWizard.mockClear();
    updatePrimed.mockResolvedValue(undefined);
    dispenseSession.startRun.mockImplementation((options) => {
      if (options.tracker) {
        markPumpPourDispenseStarted(options.tracker.current);
      }
      return Promise.resolve();
    });
  });

  it('starts priming from the prepare step', async () => {
    const user = userEvent.setup();
    const { getByText, getByRole } = renderWithProviders(
      <PrimeWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={(id) => id}
      />,
    );

    expect(getByText('Get ready to prime')).toBeInTheDocument();
    expect(getByText('bourbon')).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Start priming' }));

    expect(dispenseSession.startRun).toHaveBeenCalledWith({
      pumpId: 1,
      purpose: 'prime',
      tracker: expect.objectContaining({
        current: expect.any(Object) as PumpPourTracker,
      }) as { current: PumpPourTracker },
    });
    expect(getByText('Prime until the nozzle is wet')).toBeInTheDocument();
  });

  it('offers emergency stop while the pump is running', async () => {
    const user = userEvent.setup();
    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'prime',
        continuous: true,
        stepLabel: 'Priming line…',
      }),
    };

    const { getByRole, rerender } = renderWithProviders(
      <PrimeWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(getByRole('button', { name: 'Start priming' }));
    rerender(
      <PrimeWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(getByRole('button', { name: 'Emergency stop' }));
    expect(dispenseSession.emergencyStop).toHaveBeenCalledWith(
      1,
      expect.any(Function),
    );
  });

  it('marks the line primed when the operator confirms the nozzle is wet', async () => {
    const user = userEvent.setup();
    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'prime',
        continuous: true,
        stepLabel: 'Priming line…',
      }),
    };

    const { getByRole } = renderWithProviders(
      <PrimeWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(getByRole('button', { name: 'Start priming' }));
    await user.click(getByRole('button', { name: 'Nozzle is wet' }));

    expect(dispenseSession.stopRun).toHaveBeenCalledWith({
      tracker: expect.objectContaining({
        current: expect.any(Object) as PumpPourTracker,
      }) as { current: PumpPourTracker },
      resetTracker: false,
      waitForIdle: { pumpId: 1 },
    });
    expect(updatePrimed).toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      primed: true,
    });
    expect(getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
