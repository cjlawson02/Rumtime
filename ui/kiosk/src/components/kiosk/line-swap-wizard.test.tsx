import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LineSwapWizard } from '@/components/kiosk/line-swap-wizard';
import { markPumpPourDispenseStarted } from '@/lib/pump-pour-lifecycle';
import { renderWithProviders } from '@/test/render';
import {
  createMockPumpDispenseSession,
  runningPumpJob,
  wizardPumpStatus,
} from '@/test/wizard-mocks';

const updatePrimed = vi.fn();
const onApplySwap = vi.fn();
const onOpenChange = vi.fn();
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

const swapWizardProps = {
  open: true,
  pumpId: 1,
  fromIngredientId: 'bourbon',
  toIngredientId: 'simple',
  onOpenChange,
  onApplySwap,
  ingredientName: (id: string) => (id === 'bourbon' ? 'Bourbon' : 'Simple syrup'),
};

function renderLineSwapWizard(
  overrides: Partial<typeof swapWizardProps> = {},
) {
  return renderWithProviders(
    <LineSwapWizard {...swapWizardProps} {...overrides} />,
  );
}

async function completeContinuousRun(
  view: ReturnType<typeof renderLineSwapWizard>,
  user: ReturnType<typeof userEvent.setup>,
  props: typeof swapWizardProps,
  options: {
    purpose: 'drain' | 'flush' | 'prime';
    startLabel: string;
    completeLabel: string;
  },
) {
  await user.click(view.getByRole('button', { name: options.startLabel }));

  deviceStatus = {
    ...wizardPumpStatus,
    pumpJob: runningPumpJob({
      pumpId: 1,
      purpose: options.purpose,
      continuous: true,
      stepLabel: `${options.purpose}…`,
    }),
  };
  view.rerender(<LineSwapWizard {...props} />);

  await user.click(view.getByRole('button', { name: options.completeLabel }));

  deviceStatus = { ...wizardPumpStatus, pumpJob: null };
  view.rerender(<LineSwapWizard {...props} />);
}

describe('LineSwapWizard', () => {
  beforeEach(() => {
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    updatePrimed.mockReset();
    onApplySwap.mockReset();
    onOpenChange.mockReset();
    dispenseSession.startRun.mockClear();
    dispenseSession.stopRun.mockClear();
    dispenseSession.emergencyStop.mockClear();
    updatePrimed.mockResolvedValue(undefined);
    onApplySwap.mockResolvedValue(undefined);
    dispenseSession.startRun.mockImplementation(async (options) => {
      if (options.tracker) {
        markPumpPourDispenseStarted(options.tracker.current);
      }
    });
  });

  it('renders nothing when closed', () => {
    const { container } = renderLineSwapWizard({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the drain step for an ingredient swap', () => {
    const { getByText } = renderLineSwapWizard();

    expect(getByText('Swap to Simple syrup')).toBeInTheDocument();
    expect(getByText('Drain the old liquid')).toBeInTheDocument();
    expect(getByText(/Line 1 is on/)).toBeInTheDocument();
    expect(getByText('Bourbon')).toBeInTheDocument();
    expect(getByText('Simple syrup')).toBeInTheDocument();
  });

  it('starts a drain run from the first step', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderLineSwapWizard();

    await user.click(getByRole('button', { name: 'Start drain' }));

    expect(dispenseSession.startRun).toHaveBeenCalledWith({
      pumpId: 1,
      purpose: 'drain',
      tracker: expect.objectContaining({ current: expect.any(Object) }),
    });
  });

  it('advances through flush and purge before priming a new ingredient', async () => {
    const user = userEvent.setup();
    const view = renderLineSwapWizard();

    await completeContinuousRun(view, user, swapWizardProps, {
      purpose: 'drain',
      startLabel: 'Start drain',
      completeLabel: 'Flow stopped',
    });

    expect(view.getByText('Flush with water')).toBeInTheDocument();

    await completeContinuousRun(view, user, swapWizardProps, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Water at nozzle',
    });

    expect(view.getByText('Purge the line dry')).toBeInTheDocument();

    await completeContinuousRun(view, user, swapWizardProps, {
      purpose: 'drain',
      startLabel: 'Start purge',
      completeLabel: 'Only air coming out',
    });

    expect(view.getByText('Connect the new bottle')).toBeInTheDocument();
    expect(onApplySwap).not.toHaveBeenCalled();
  });

  it('marks the new line primed and finishes the swap', async () => {
    const user = userEvent.setup();
    const view = renderLineSwapWizard();

    await completeContinuousRun(view, user, swapWizardProps, {
      purpose: 'drain',
      startLabel: 'Start drain',
      completeLabel: 'Flow stopped',
    });
    await completeContinuousRun(view, user, swapWizardProps, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Water at nozzle',
    });
    await completeContinuousRun(view, user, swapWizardProps, {
      purpose: 'drain',
      startLabel: 'Start purge',
      completeLabel: 'Only air coming out',
    });

    await user.click(
      view.getByRole('button', { name: 'Simple syrup connected' }),
    );
    expect(onApplySwap).toHaveBeenCalledOnce();

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'prime',
        continuous: true,
        stepLabel: 'Priming…',
      }),
    };
    view.rerender(<LineSwapWizard {...swapWizardProps} />);

    await user.click(view.getByRole('button', { name: 'Nozzle is wet' }));

    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    view.rerender(<LineSwapWizard {...swapWizardProps} />);

    expect(updatePrimed).toHaveBeenCalledWith({
      ingredientId: 'simple',
      primed: true,
    });
    expect(view.getByText('Line ready')).toBeInTheDocument();
    expect(view.getByText('Line 1 is ready')).toBeInTheDocument();
  });

  it('clears a line without a prime step when unassigning', async () => {
    const user = userEvent.setup();
    const unassignProps = { ...swapWizardProps, toIngredientId: null };
    const view = renderLineSwapWizard({ toIngredientId: null });

    expect(view.getByText('Clear line 1')).toBeInTheDocument();

    await completeContinuousRun(view, user, unassignProps, {
      purpose: 'drain',
      startLabel: 'Start drain',
      completeLabel: 'Flow stopped',
    });
    await completeContinuousRun(view, user, unassignProps, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Water at nozzle',
    });
    await completeContinuousRun(view, user, unassignProps, {
      purpose: 'drain',
      startLabel: 'Start purge',
      completeLabel: 'Only air coming out',
    });

    expect(view.getByText('Line stored dry')).toBeInTheDocument();
    expect(onApplySwap).toHaveBeenCalledOnce();
    expect(view.queryByText('Connect the new bottle')).not.toBeInTheDocument();
  });
});
