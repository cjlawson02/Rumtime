import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PumpCalibrationFields } from '@/components/kiosk/pump-calibration-fields';
import { renderWithProviders } from '@/test/render';

const updatePumpCalibration = vi.fn();

vi.mock('@/hooks/use-device-mutations', () => ({
  useUpdatePumpCalibration: () => ({ mutateAsync: updatePumpCalibration }),
}));

describe('PumpCalibrationFields', () => {
  beforeEach(() => {
    updatePumpCalibration.mockReset();
    updatePumpCalibration.mockResolvedValue(undefined);
  });

  it('renders flow rate and anti-drip fields together', () => {
    const { getByLabelText, getByText } = renderWithProviders(
      <PumpCalibrationFields pumpId={1} mlPerSecond={2} antiDripMs={100} />,
    );

    expect(getByLabelText('Flow rate')).toBeInTheDocument();
    expect(getByLabelText('Anti-drip')).toBeInTheDocument();
    expect(getByText(/s \/ shot/)).toBeInTheDocument();
  });

  it('saves an updated flow rate from the number pad', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();

    const { container, getByRole } = renderWithProviders(
      <PumpCalibrationFields
        pumpId={1}
        mlPerSecond={2}
        antiDripMs={100}
        onError={onError}
      />,
    );

    await user.click(container.querySelector('#pump-1-ml-per-s')!);
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: '3' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(updatePumpCalibration).toHaveBeenCalledWith({
      pumpId: 1,
      mlPerSecond: 3,
      antiDripMs: 100,
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports validation errors for invalid flow rates', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();

    const { container, getByRole } = renderWithProviders(
      <PumpCalibrationFields
        pumpId={1}
        mlPerSecond={2}
        antiDripMs={100}
        onError={onError}
      />,
    );

    await user.click(container.querySelector('#pump-1-ml-per-s')!);
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(onError).toHaveBeenCalledWith('Enter a valid flow rate');
    expect(updatePumpCalibration).not.toHaveBeenCalled();
  });

  it('saves an updated anti-drip delay', async () => {
    const user = userEvent.setup();

    const { container, getByRole } = renderWithProviders(
      <PumpCalibrationFields pumpId={1} mlPerSecond={2} antiDripMs={100} />,
    );

    await user.click(container.querySelector('#pump-1-anti-drip')!);
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(updatePumpCalibration).toHaveBeenCalledWith({
      pumpId: 1,
      mlPerSecond: 2,
      antiDripMs: 200,
    });
  });

  it('renders only the requested field group', () => {
    const { getByLabelText, queryByLabelText } = renderWithProviders(
      <PumpCalibrationFields
        pumpId={1}
        mlPerSecond={2}
        antiDripMs={100}
        fields="flowRate"
      />,
    );

    expect(getByLabelText('Flow rate')).toBeInTheDocument();
    expect(queryByLabelText('Anti-drip')).not.toBeInTheDocument();
  });

  it('does not open editors while disabled', async () => {
    const user = userEvent.setup();

    const { container, queryByRole } = renderWithProviders(
      <PumpCalibrationFields
        pumpId={1}
        mlPerSecond={2}
        antiDripMs={100}
        disabled
      />,
    );

    await user.click(container.querySelector('#pump-1-ml-per-s')!);

    expect(queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('reports out-of-range flow rate values', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();

    const { container, getByRole } = renderWithProviders(
      <PumpCalibrationFields
        pumpId={1}
        mlPerSecond={2}
        antiDripMs={100}
        onError={onError}
      />,
    );

    await user.click(container.querySelector('#pump-1-ml-per-s')!);
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '5' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(onError).toHaveBeenCalledWith(
      'Flow rate must be between 0.01 and 100 ml/s',
    );
  });

  it('closes without saving when the edited value is unchanged', async () => {
    const user = userEvent.setup();

    const { container, getByRole, queryByRole } = renderWithProviders(
      <PumpCalibrationFields pumpId={1} mlPerSecond={2} antiDripMs={100} />,
    );

    await user.click(container.querySelector('#pump-1-ml-per-s')!);
    await user.click(getByRole('button', { name: 'Save' }));

    expect(updatePumpCalibration).not.toHaveBeenCalled();
    expect(queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('reports device errors while saving', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    updatePumpCalibration.mockRejectedValue(new Error('device offline'));

    const { container, getByRole } = renderWithProviders(
      <PumpCalibrationFields
        pumpId={1}
        mlPerSecond={2}
        antiDripMs={100}
        onError={onError}
      />,
    );

    await user.click(container.querySelector('#pump-1-ml-per-s')!);
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: '3' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(onError).toHaveBeenCalledWith('device offline');
  });
});
