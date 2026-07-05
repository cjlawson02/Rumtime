import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

import { CleaningWizard } from '@/components/kiosk/cleaning-wizard';
import { SANITIZER_CONTACT_SECONDS } from '@/lib/cleaning';
import { markPumpPourDispenseStarted } from '@/lib/pump-pour-lifecycle';
import { renderWithProviders } from '@/test/render';
import {
  createMockPumpDispenseSession,
  runningPumpJob,
  wizardPumpStatus,
} from '@/test/wizard-mocks';

const updatePrimed = vi.fn();
const updatePumpBinding = vi.fn();
const dispenseSession = createMockPumpDispenseSession();

let deviceStatus = wizardPumpStatus;

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
}));

vi.mock('@/hooks/use-device-mutations', () => ({
  useUpdatePrimed: () => ({ mutateAsync: updatePrimed }),
  useUpdatePumpBinding: () => ({ mutateAsync: updatePumpBinding }),
}));

vi.mock('@/hooks/use-pump-dispense-session', () => ({
  usePumpDispenseSession: () => dispenseSession,
}));

const cleaningWizardProps = {
  open: true,
  pumpIds: [1],
  mode: 'line' as const,
  onOpenChange: vi.fn(),
  ingredientName: () => 'Bourbon',
};

const sessionWizardProps = {
  open: true,
  pumpIds: [1, 2],
  mode: 'session' as const,
  onOpenChange: vi.fn(),
  onComplete: vi.fn(),
  ingredientName: (id: string) => (id === 'simple' ? 'Simple syrup' : 'Bourbon'),
};

function renderCleaningWizard(
  props: typeof cleaningWizardProps = cleaningWizardProps,
) {
  return renderWithProviders(<CleaningWizard {...props} />);
}

async function advanceToFlushIntro(
  user: ReturnType<typeof userEvent.setup>,
  props: typeof cleaningWizardProps = cleaningWizardProps,
) {
  const view = renderCleaningWizard(props);
  await user.click(view.getByRole('button', { name: 'Start cleaning' }));
  return view;
}

async function completeContinuousRun(
  view: ReturnType<typeof renderCleaningWizard>,
  user: ReturnType<typeof userEvent.setup>,
  options: {
    purpose: 'flush' | 'sanitize' | 'drain';
    startLabel: string;
    completeLabel: string;
    pumpId?: number;
    wizardProps?: typeof cleaningWizardProps;
  },
) {
  const props = options.wizardProps ?? cleaningWizardProps;

  await user.click(view.getByRole('button', { name: options.startLabel }));

  deviceStatus = {
    ...deviceStatus,
    pumpJob: runningPumpJob({
      pumpId: options.pumpId ?? 1,
      purpose: options.purpose,
      continuous: true,
      stepLabel: `${options.purpose}…`,
    }),
  };
  view.rerender(<CleaningWizard {...props} />);

  await user.click(view.getByRole('button', { name: options.completeLabel }));

  deviceStatus = { ...deviceStatus, pumpJob: null };
  view.rerender(<CleaningWizard {...props} />);
}

async function completeSingleLineCleaningCycle(
  view: ReturnType<typeof renderCleaningWizard>,
  user: ReturnType<typeof userEvent.setup>,
  props: typeof cleaningWizardProps = cleaningWizardProps,
) {
  await user.click(view.getByRole('button', { name: 'Start cleaning' }));
  await user.click(view.getByRole('button', { name: 'Continue' }));
  await completeContinuousRun(view, user, {
    purpose: 'flush',
    startLabel: 'Start flush',
    completeLabel: 'Line runs clear',
    wizardProps: props,
  });
  await user.click(view.getByRole('button', { name: 'Continue' }));
  await completeContinuousRun(view, user, {
    purpose: 'sanitize',
    startLabel: 'Start sanitizer run',
    completeLabel: 'Sanitizer at nozzle',
    wizardProps: props,
  });
  await user.click(view.getByRole('button', { name: 'Skip wait' }));
  await user.click(view.getByRole('button', { name: 'Continue to drain' }));
  await completeContinuousRun(view, user, {
    purpose: 'drain',
    startLabel: 'Start drain',
    completeLabel: 'Line drained',
    wizardProps: props,
  });
}

describe('CleaningWizard', () => {
  beforeEach(() => {
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    updatePrimed.mockReset();
    updatePumpBinding.mockReset();
    dispenseSession.reset();
    dispenseSession.startRun.mockClear();
    dispenseSession.stopRun.mockClear();
    updatePrimed.mockResolvedValue(undefined);
    updatePumpBinding.mockResolvedValue(undefined);
    dispenseSession.startRun.mockImplementation(async (options) => {
      if (options.tracker) {
        markPumpPourDispenseStarted(options.tracker.current);
      }
    });
  });

  it('shows the prepare step for a single-line clean', () => {
    const { getByText } = renderWithProviders(
      <CleaningWizard
        open
        pumpIds={[1]}
        mode="line"
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    expect(getByText('Get ready to clean')).toBeInTheDocument();
    expect(
      getByText(/Run the full flush, sanitize, and drain cycle/i),
    ).toBeInTheDocument();
  });

  it('advances to the flush intro after the operator starts cleaning', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = renderWithProviders(
      <CleaningWizard
        open
        pumpIds={[1]}
        mode="line"
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(getByRole('button', { name: 'Start cleaning' }));

    expect(getByText('Warm-water flush')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('starts a timed flush run for the selected line', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = renderWithProviders(
      <CleaningWizard
        open
        pumpIds={[1]}
        mode="line"
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(getByRole('button', { name: 'Start cleaning' }));
    await user.click(getByRole('button', { name: 'Continue' }));
    await user.click(getByRole('button', { name: 'Start flush' }));

    expect(dispenseSession.startRun).toHaveBeenCalledWith({
      pumpId: 1,
      purpose: 'flush',
      tracker: expect.objectContaining({ current: expect.any(Object) }),
    });
    expect(getByText(/Flush until the line runs clear/i)).toBeInTheDocument();
  });

  it('advances to sanitize intro after flush completes', async () => {
    const user = userEvent.setup();
    const view = await advanceToFlushIntro(user);

    await user.click(view.getByRole('button', { name: 'Continue' }));
    await completeContinuousRun(view, user, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Line runs clear',
    });

    expect(view.getByText('Move tubes to sanitizer')).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Continue' }));

    expect(
      view.getByRole('button', { name: 'Start sanitizer run' }),
    ).toBeInTheDocument();
    expect(dispenseSession.stopRun).toHaveBeenCalled();
  });

  it('shows contact timer countdown before drain', async () => {
    const user = userEvent.setup();
    const view = await advanceToFlushIntro(user);

    await user.click(view.getByRole('button', { name: 'Continue' }));
    await completeContinuousRun(view, user, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Line runs clear',
    });
    await user.click(view.getByRole('button', { name: 'Continue' }));
    await completeContinuousRun(view, user, {
      purpose: 'sanitize',
      startLabel: 'Start sanitizer run',
      completeLabel: 'Sanitizer at nozzle',
    });

    expect(view.getByText(`${SANITIZER_CONTACT_SECONDS}s`)).toBeInTheDocument();
    expect(
      view.getByRole('button', {
        name: `${SANITIZER_CONTACT_SECONDS}s remaining`,
      }),
    ).toBeDisabled();
    expect(view.getByRole('button', { name: 'Skip wait' })).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Skip wait' }));

    expect(
      view.getByRole('button', { name: 'Continue to drain' }),
    ).toBeEnabled();
  });

  it('starts continuous drain run for the selected line', async () => {
    const user = userEvent.setup();
    const view = await advanceToFlushIntro(user);

    await user.click(view.getByRole('button', { name: 'Continue' }));
    await completeContinuousRun(view, user, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Line runs clear',
    });
    await user.click(view.getByRole('button', { name: 'Continue' }));
    await completeContinuousRun(view, user, {
      purpose: 'sanitize',
      startLabel: 'Start sanitizer run',
      completeLabel: 'Sanitizer at nozzle',
    });
    await user.click(view.getByRole('button', { name: 'Skip wait' }));
    await user.click(view.getByRole('button', { name: 'Continue to drain' }));

    expect(view.getByText('Drain into waste')).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Start drain' }));

    expect(dispenseSession.startRun).toHaveBeenCalledWith({
      pumpId: 1,
      purpose: 'drain',
      tracker: expect.objectContaining({ current: expect.any(Object) }),
    });
  });

  it('shows session mode copy for multi-line cleaning', async () => {
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    const user = userEvent.setup();
    const view = renderWithProviders(
      <CleaningWizard {...sessionWizardProps} />,
    );

    expect(view.getByText('Session line clean')).toBeInTheDocument();
    expect(view.getByText(/Clean 2 lines after service/i)).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Start cleaning' }));
    await user.click(view.getByRole('button', { name: 'Continue' }));

    expect(view.getByText('Flush line 1 of 2')).toBeInTheDocument();
  });

  it('walks through flush steps for each line in session mode', async () => {
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    const user = userEvent.setup();
    const view = renderWithProviders(
      <CleaningWizard {...sessionWizardProps} />,
    );

    await user.click(view.getByRole('button', { name: 'Start cleaning' }));
    await user.click(view.getByRole('button', { name: 'Continue' }));

    await completeContinuousRun(
      view,
      user,
      {
        purpose: 'flush',
        startLabel: 'Start flush',
        completeLabel: 'Line runs clear',
        pumpId: 1,
        wizardProps: sessionWizardProps,
      },
    );

    expect(view.getByText('Flush line 2 of 2')).toBeInTheDocument();
    expect(view.getByText('Simple syrup')).toBeInTheDocument();
  });

  it('calls emergency stop while a flush run is active', async () => {
    const user = userEvent.setup();
    dispenseSession.emergencyStop.mockImplementation((_pumpId, callback) => {
      callback?.();
    });
    const view = await advanceToFlushIntro(user);

    await user.click(view.getByRole('button', { name: 'Continue' }));
    await user.click(view.getByRole('button', { name: 'Start flush' }));

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'flush',
        continuous: true,
      }),
    };
    view.rerender(<CleaningWizard {...cleaningWizardProps} />);

    await user.click(view.getByRole('button', { name: 'Emergency stop' }));

    expect(dispenseSession.emergencyStop).toHaveBeenCalledWith(
      1,
      expect.any(Function),
    );
  });

  it('finishes the cycle and resets cleaned line assignments', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();
    const props = {
      ...cleaningWizardProps,
      onComplete,
      onOpenChange,
    };
    const view = renderWithProviders(<CleaningWizard {...props} />);

    await completeSingleLineCleaningCycle(view, user, props);

    expect(view.getByText('Cleaning cycle complete')).toBeInTheDocument();
    expect(view.getByText(/unassigned/i)).toBeInTheDocument();
    expect(view.getByText(/needs prime/i)).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(updatePrimed).toHaveBeenCalledWith({
        ingredientId: 'bourbon',
        primed: false,
      });
    });
    expect(updatePumpBinding).toHaveBeenCalledWith({
      pumpId: 1,
      ingredientId: null,
    });
    expect(onComplete).toHaveBeenCalledWith({ 1: 'done' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes immediately when no lines are selected', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };

    const view = renderWithProviders(
      <CleaningWizard
        open
        pumpIds={[99]}
        mode="line"
        onOpenChange={onOpenChange}
        ingredientName={() => 'Unknown'}
      />,
    );

    expect(view.getByText('No lines selected for cleaning.')).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <CleaningWizard
        open={false}
        pumpIds={[1]}
        mode="line"
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers an extra flush for sticky lines and can skip it', async () => {
    const user = userEvent.setup();
    const props = {
      ...cleaningWizardProps,
      pumpIds: [2],
      ingredientName: () => 'Simple syrup',
    };
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    const view = renderWithProviders(<CleaningWizard {...props} />);

    await user.click(view.getByRole('button', { name: 'Start cleaning' }));
    await user.click(view.getByRole('button', { name: 'Continue' }));
    await completeContinuousRun(view, user, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Line runs clear',
      pumpId: 2,
      wizardProps: props,
    });

    expect(view.getByText(/Simple syrup is sticky/i)).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Skip extra flush' }));

    expect(view.getByText('Move tubes to sanitizer')).toBeInTheDocument();
  });

  it('shows an error when a flush run is emergency-stopped', async () => {
    const user = userEvent.setup();
    dispenseSession.emergencyStop.mockImplementation((_pumpId, callback) => {
      callback?.();
    });
    const view = await advanceToFlushIntro(user);

    await user.click(view.getByRole('button', { name: 'Continue' }));
    await user.click(view.getByRole('button', { name: 'Start flush' }));

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'flush',
        continuous: true,
      }),
    };
    view.rerender(<CleaningWizard {...cleaningWizardProps} />);

    await user.click(view.getByRole('button', { name: 'Emergency stop' }));

    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    view.rerender(<CleaningWizard {...cleaningWizardProps} />);
    view.rerender(<CleaningWizard {...cleaningWizardProps} />);

    expect(view.getByText(/Flushing line stopped/i)).toBeInTheDocument();
  });

  it('steps back from sanitize intro to the previous flush run', async () => {
    const user = userEvent.setup();
    const view = await advanceToFlushIntro(user);

    await user.click(view.getByRole('button', { name: 'Continue' }));
    await completeContinuousRun(view, user, {
      purpose: 'flush',
      startLabel: 'Start flush',
      completeLabel: 'Line runs clear',
    });

    expect(view.getByText('Move tubes to sanitizer')).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Back' }));

    expect(view.getByText('Flush until the line runs clear')).toBeInTheDocument();
  });

  it('counts down sanitizer contact time automatically', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const view = await advanceToFlushIntro(user);

      await user.click(view.getByRole('button', { name: 'Continue' }));
      await completeContinuousRun(view, user, {
        purpose: 'flush',
        startLabel: 'Start flush',
        completeLabel: 'Line runs clear',
      });
      await user.click(view.getByRole('button', { name: 'Continue' }));
      await completeContinuousRun(view, user, {
        purpose: 'sanitize',
        startLabel: 'Start sanitizer run',
        completeLabel: 'Sanitizer at nozzle',
      });

      expect(view.getByText(`${SANITIZER_CONTACT_SECONDS}s`)).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(2000);

      expect(view.getByText(`${SANITIZER_CONTACT_SECONDS - 2}s`)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
