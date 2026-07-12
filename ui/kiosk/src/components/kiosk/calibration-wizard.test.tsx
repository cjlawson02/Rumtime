import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalibrationWizard } from '@/components/kiosk/calibration-wizard';
import {
  DEFAULT_CALIBRATION_RUN_SECONDS,
  VERIFICATION_VOLUMES_ML,
} from '@/lib/calibration';
import {
  markPumpPourDispenseStarted,
  type PumpPourTracker,
} from '@/lib/pump-pour-lifecycle';
import { renderWithProviders } from '@/test/render';
import {
  createMockPumpDispenseSession,
  runningPumpJob,
  wizardPumpStatus,
} from '@/test/wizard-mocks';

const updatePumpCalibration = vi.fn();
const dispenseSession = createMockPumpDispenseSession();

let deviceStatus = wizardPumpStatus;

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
}));

vi.mock('@/hooks/use-device-mutations', () => ({
  useUpdatePumpCalibration: () => ({ mutateAsync: updatePumpCalibration }),
}));

vi.mock('@/hooks/use-pump-dispense-session', () => ({
  usePumpDispenseSession: () => dispenseSession,
}));

vi.mock('@/components/kiosk/prime-wizard', () => ({
  PrimeWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="prime-wizard">Prime wizard open</div> : null,
}));

const calibrationWizardProps = {
  open: true,
  pumpId: 1,
  onOpenChange: vi.fn(),
  ingredientName: () => 'Bourbon',
};

function renderCalibrationWizard() {
  return renderWithProviders(<CalibrationWizard {...calibrationWizardProps} />);
}

async function advanceToVerifyStep(
  view: ReturnType<typeof renderCalibrationWizard>,
  user: ReturnType<typeof userEvent.setup>,
) {
  await completeCalibrationRunAndSaveFlowRate(view, user);
}

async function completeCalibrationRunAndSaveFlowRate(
  view: ReturnType<typeof renderCalibrationWizard>,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    view.getByRole('button', {
      name: `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`,
    }),
  );

  deviceStatus = {
    ...wizardPumpStatus,
    pumpJob: runningPumpJob({
      pumpId: 1,
      purpose: 'calibration',
      durationSeconds: DEFAULT_CALIBRATION_RUN_SECONDS,
      stepLabel: 'Calibration run…',
    }),
  };
  view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

  deviceStatus = { ...wizardPumpStatus, pumpJob: null };
  view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

  await user.click(view.getByRole('button', { name: '4' }));
  await user.click(view.getByRole('button', { name: '3' }));
  await user.click(view.getByRole('button', { name: 'Decimal point' }));
  await user.click(view.getByRole('button', { name: '7' }));
  await user.click(view.getByRole('button', { name: '5' }));

  await user.click(view.getByRole('button', { name: 'Review flow rate' }));
  await user.click(view.getByRole('button', { name: 'Save flow rate' }));
}

describe('CalibrationWizard', () => {
  beforeEach(() => {
    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    updatePumpCalibration.mockReset();
    dispenseSession.reset();
    dispenseSession.startRun.mockClear();
    dispenseSession.emergencyStop.mockClear();
    dispenseSession.closeWizard.mockClear();
    updatePumpCalibration.mockResolvedValue(undefined);
    dispenseSession.startRun.mockImplementation((options) => {
      if (options.tracker) {
        markPumpPourDispenseStarted(options.tracker.current);
      }
      return Promise.resolve();
    });
  });

  it('starts a timed calibration pour when the line is primed', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = renderWithProviders(
      <CalibrationWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    expect(getByText('Run calibration pour')).toBeInTheDocument();

    await user.click(
      getByRole('button', {
        name: `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`,
      }),
    );

    expect(dispenseSession.startRun).toHaveBeenCalledWith({
      pumpId: 1,
      purpose: 'calibration',
      durationSeconds: DEFAULT_CALIBRATION_RUN_SECONDS,
      tracker: expect.objectContaining({
        current: expect.any(Object) as PumpPourTracker,
      }) as { current: PumpPourTracker },
    });
  });

  it('advances to measured volume after the calibration run finishes', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText, rerender } = renderWithProviders(
      <CalibrationWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(
      getByRole('button', {
        name: `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`,
      }),
    );

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'calibration',
        durationSeconds: DEFAULT_CALIBRATION_RUN_SECONDS,
        stepLabel: 'Calibration run…',
      }),
    };
    rerender(
      <CalibrationWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    rerender(
      <CalibrationWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    expect(getByText('Enter measured volume')).toBeInTheDocument();
  });

  it('saves the measured flow rate before verification pours', async () => {
    const user = userEvent.setup();
    const view = renderWithProviders(
      <CalibrationWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(
      view.getByRole('button', {
        name: `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`,
      }),
    );

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'calibration',
        durationSeconds: DEFAULT_CALIBRATION_RUN_SECONDS,
        stepLabel: 'Calibration run…',
      }),
    };
    view.rerender(
      <CalibrationWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    view.rerender(
      <CalibrationWizard
        open
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    await user.click(view.getByRole('button', { name: '4' }));
    await user.click(view.getByRole('button', { name: '3' }));
    await user.click(view.getByRole('button', { name: 'Decimal point' }));
    await user.click(view.getByRole('button', { name: '7' }));
    await user.click(view.getByRole('button', { name: '5' }));

    await user.click(view.getByRole('button', { name: 'Review flow rate' }));
    await user.click(view.getByRole('button', { name: 'Save flow rate' }));

    expect(updatePumpCalibration).toHaveBeenCalledWith({
      pumpId: 1,
      mlPerSecond: 43.75 / DEFAULT_CALIBRATION_RUN_SECONDS,
      antiDripMs: 100,
    });
    expect(view.getByText('Verify test pours')).toBeInTheDocument();
  });

  it('shows verification volume buttons after saving flow rate', async () => {
    const user = userEvent.setup();
    const view = renderCalibrationWizard();

    await completeCalibrationRunAndSaveFlowRate(view, user);

    for (const ml of VERIFICATION_VOLUMES_ML) {
      expect(
        view.getByRole('button', { name: `${ml} ml` }),
      ).toBeInTheDocument();
    }
  });

  it('starts a verify pour with the selected volume', async () => {
    const user = userEvent.setup();
    const view = renderCalibrationWizard();

    await completeCalibrationRunAndSaveFlowRate(view, user);

    dispenseSession.startRun.mockClear();
    await user.click(view.getByRole('button', { name: '30 ml' }));

    expect(dispenseSession.startRun).toHaveBeenCalledWith({
      pumpId: 1,
      purpose: 'verify',
      ml: 30,
      tracker: expect.objectContaining({
        current: expect.any(Object) as PumpPourTracker,
      }) as { current: PumpPourTracker },
    });
  });

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <CalibrationWizard
        open={false}
        pumpId={1}
        onOpenChange={vi.fn()}
        ingredientName={() => 'Bourbon'}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('opens the prime sub-wizard from the run step', async () => {
    const user = userEvent.setup();
    const view = renderCalibrationWizard();

    await user.click(view.getByRole('button', { name: 'Re-prime line' }));

    expect(view.getByTestId('prime-wizard')).toBeInTheDocument();
  });

  it('shows unprimed guidance and disables the calibration pour', () => {
    deviceStatus = {
      ...wizardPumpStatus,
      bindings: {
        ...wizardPumpStatus.bindings,
        bourbon: {
          ...wizardPumpStatus.bindings.bourbon,
          primed: false,
        },
      },
    };

    const view = renderCalibrationWizard();

    expect(
      view.getByText(/Calibrating on a dry line gives bad numbers/i),
    ).toBeInTheDocument();
    expect(
      view.getByRole('button', {
        name: `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`,
      }),
    ).toBeDisabled();
  });

  it('shows a validation error for an out-of-range measured volume', async () => {
    const user = userEvent.setup();
    const view = renderCalibrationWizard();

    await user.click(
      view.getByRole('button', {
        name: `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`,
      }),
    );

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'calibration',
        durationSeconds: DEFAULT_CALIBRATION_RUN_SECONDS,
      }),
    };
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

    await user.click(view.getByRole('button', { name: '3' }));
    await user.click(view.getByRole('button', { name: '0' }));
    await user.click(view.getByRole('button', { name: '0' }));
    await user.click(view.getByRole('button', { name: '0' }));

    expect(
      view.getByText(/Measured volume is too high/i),
    ).toBeInTheDocument();
    expect(
      view.getByRole('button', { name: 'Review flow rate' }),
    ).toBeDisabled();
  });

  it('surfaces save errors from the device API', async () => {
    const user = userEvent.setup();
    const view = renderCalibrationWizard();
    updatePumpCalibration.mockRejectedValueOnce(new Error('Save failed'));

    await completeCalibrationRunAndSaveFlowRate(view, user);
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

    expect(view.getByText('Save failed')).toBeInTheDocument();
  });

  it('shows an error when the calibration run is stopped', async () => {
    const user = userEvent.setup();
    dispenseSession.emergencyStop.mockImplementation((_pumpId, callback) => {
      callback?.();
      return Promise.resolve();
    });
    const view = renderCalibrationWizard();

    await user.click(
      view.getByRole('button', {
        name: `Run ${DEFAULT_CALIBRATION_RUN_SECONDS}s pour`,
      }),
    );

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'calibration',
        durationSeconds: DEFAULT_CALIBRATION_RUN_SECONDS,
      }),
    };
    dispenseSession.statusRef.current = deviceStatus;
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

    await user.click(view.getByRole('button', { name: 'Stop' }));

    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

    expect(view.getByText('Calibration run stopped.')).toBeInTheDocument();
  });

  it('shows an error when a verify pour is stopped', async () => {
    const user = userEvent.setup();
    dispenseSession.emergencyStop.mockImplementation((_pumpId, callback) => {
      callback?.();
      return Promise.resolve();
    });
    const view = renderCalibrationWizard();

    await advanceToVerifyStep(view, user);
    await user.click(view.getByRole('button', { name: '30 ml' }));

    deviceStatus = {
      ...wizardPumpStatus,
      pumpJob: runningPumpJob({
        pumpId: 1,
        purpose: 'verify',
        targetMl: 30,
      }),
    };
    dispenseSession.statusRef.current = deviceStatus;
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

    await user.click(view.getByRole('button', { name: 'Stop' }));

    deviceStatus = { ...wizardPumpStatus, pumpJob: null };
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);
    view.rerender(<CalibrationWizard {...calibrationWizardProps} />);

    expect(view.getByText('Test pour stopped.')).toBeInTheDocument();
  });

  it('advances through anti-drip and done steps', async () => {
    const user = userEvent.setup();
    const view = renderCalibrationWizard();

    await advanceToVerifyStep(view, user);
    await user.click(
      view.getByRole('button', { name: 'Continue to anti-drip' }),
    );

    expect(view.getByText('Tune anti-drip')).toBeInTheDocument();
    expect(
      view.getByRole('button', { name: 'Test pour 30 ml' }),
    ).toBeInTheDocument();

    await user.click(
      view.getByRole('button', { name: 'Finish calibration' }),
    );

    expect(view.getByText('Line 1 calibrated')).toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Done' }));

    expect(dispenseSession.closeWizard).toHaveBeenCalled();
    const closeHandler = dispenseSession.closeWizard.mock.calls[0]?.[0];
    expect(closeHandler).toHaveBeenCalledWith(false);
  });
});