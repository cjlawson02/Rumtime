import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { SetupPumpsPage } from '@/pages/setup-pumps-page';
import { renderWithProviders } from '@/test/render';

const { applyIngredientSwap, refillIngredient, updateBottleSize } = vi.hoisted(() => ({
  applyIngredientSwap: vi.fn(),
  refillIngredient: vi.fn(),
  updateBottleSize: vi.fn(),
}));

let deviceStatus: DeviceStatus | undefined;

vi.mock('@/lib/setup-unlock', () => ({
  hasSetupUnlock: () => true,
  grantSetupUnlock: vi.fn(),
}));

vi.mock('@/components/kiosk/fill-level-input', () => ({
  FillLevelInput: ({
    ingredientId,
    onSaved,
    trailing,
  }: {
    ingredientId: string;
    onSaved?: () => void;
    trailing?: React.ReactNode;
  }) => (
    <div data-testid={`fill-level-${ingredientId}`}>
      <button type="button" onClick={() => onSaved?.()}>
        Save fill level
      </button>
      {trailing}
    </div>
  ),
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

vi.mock('@/components/kiosk/line-swap-wizard', () => ({
  LineSwapWizard: ({
    open,
    pumpId,
    onApplySwap,
    onOpenChange,
  }: {
    open: boolean;
    pumpId: number;
    onApplySwap?: () => Promise<void>;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="line-swap-wizard">
        Line swap for pump {pumpId}
        <button type="button" onClick={() => void onApplySwap?.()}>
          Apply swap
        </button>
        <button type="button" onClick={() => onOpenChange?.(false)}>
          Close swap
        </button>
      </div>
    ) : null,
}));

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: deviceStatus }),
}));

vi.mock('@/hooks/use-device-mutations', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/use-device-mutations')>();
  return {
    ...actual,
    useApplyIngredientSwap: () => ({ mutateAsync: applyIngredientSwap }),
    useRefillIngredient: () => ({ mutateAsync: refillIngredient }),
    useUpdateBottleSize: () => ({ mutateAsync: updateBottleSize }),
  };
});

const pumpsStatus: DeviceStatus = {
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
    { pumpId: 2, ingredientId: null },
  ],
};

describe('SetupPumpsPage', () => {
  beforeEach(() => {
    deviceStatus = pumpsStatus;
    applyIngredientSwap.mockReset();
    refillIngredient.mockReset();
    updateBottleSize.mockReset();
    applyIngredientSwap.mockResolvedValue(undefined);
    refillIngredient.mockResolvedValue(undefined);
    updateBottleSize.mockResolvedValue(undefined);
  });

  it('shows the pump list with line labels', () => {
    const { getByText } = renderWithProviders(<SetupPumpsPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Bottle bay')).toBeInTheDocument();
    expect(getByText('Line 1')).toBeInTheDocument();
    expect(getByText('Line 2')).toBeInTheDocument();
  });

  it('opens the prime wizard after assigning an ingredient to an empty line', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, getByTestId } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(getByRole('combobox', { name: 'Line 2 ingredient' }), 'simple');

    expect(applyIngredientSwap).toHaveBeenCalledWith({
      pumpId: 2,
      fromIngredientId: null,
      toIngredientId: 'simple',
    });

    await user.click(getByRole('button', { name: 'Prime now' }));

    expect(getByTestId('prime-wizard')).toHaveTextContent(
      'Prime wizard for pump 2',
    );
  });

  it('opens the line swap wizard when changing an assigned ingredient', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, getByTestId } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 1 ingredient' }),
      'simple',
    );

    await user.click(getByRole('button', { name: 'Start swap' }));

    expect(getByTestId('line-swap-wizard')).toHaveTextContent(
      'Line swap for pump 1',
    );
  });

  it('shows loading when device status is not ready', () => {
    deviceStatus = undefined;

    const { getByText } = renderWithProviders(<SetupPumpsPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Loading bottle bay…')).toBeInTheDocument();
  });

  it('marks a line as refilled and shows the refilled indicator', async () => {
    const user = userEvent.setup();
    const { getByRole, getByLabelText } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: 'Mark refilled' }));

    expect(refillIngredient).toHaveBeenCalledWith({ ingredientId: 'bourbon' });
    expect(getByLabelText('Refilled')).toBeInTheDocument();
  });

  it('surfaces refill errors in the panel', async () => {
    refillIngredient.mockRejectedValue(new Error('Pump busy'));

    const user = userEvent.setup();
    const { getByRole, findByText } = renderWithProviders(<SetupPumpsPage />, {
      withSetupReturn: true,
    });

    await user.click(getByRole('button', { name: 'Mark refilled' }));

    expect(await findByText('Pump busy')).toBeInTheDocument();
  });

  it('updates bottle size for an assigned line', async () => {
    const user = userEvent.setup();
    const { getByLabelText } = renderWithProviders(<SetupPumpsPage />, {
      withSetupReturn: true,
    });

    await user.selectOptions(
      getByLabelText('Bottle size', { selector: '#pump-1-size' }),
      '375',
    );

    expect(updateBottleSize).toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      bottleSizeMl: 375,
    });
  });

  it('clears the refilled indicator when fill level is saved', async () => {
    const user = userEvent.setup();
    const { getByRole, getByLabelText, queryByLabelText } =
      renderWithProviders(<SetupPumpsPage />, { withSetupReturn: true });

    await user.click(getByRole('button', { name: 'Mark refilled' }));
    expect(getByLabelText('Refilled')).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Save fill level' }));

    expect(queryByLabelText('Refilled')).not.toBeInTheDocument();
    expect(getByRole('button', { name: 'Mark refilled' })).toBeInTheDocument();
  });

  it('unassigns a line after confirming in the swap dialog', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 1 ingredient' }),
      '',
    );

    expect(getByRole('heading', { name: 'Clear line 1?' })).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Unassign anyway' }));

    expect(applyIngredientSwap).toHaveBeenCalledWith({
      pumpId: 1,
      fromIngredientId: 'bourbon',
      toIngredientId: null,
    });
  });

  it('assigns a new ingredient without cleaning when chosen in the swap dialog', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 1 ingredient' }),
      'simple',
    );

    await user.click(
      getByRole('button', { name: 'Assign without cleaning' }),
    );

    expect(applyIngredientSwap).toHaveBeenCalledWith({
      pumpId: 1,
      fromIngredientId: 'bourbon',
      toIngredientId: 'simple',
    });
  });

  it('dismisses the prime prompt when Later is chosen', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, queryByTestId } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 2 ingredient' }),
      'simple',
    );

    await user.click(getByRole('button', { name: 'Later' }));

    expect(queryByTestId('prime-wizard')).not.toBeInTheDocument();
  });

  it('shows guidance when a line has no ingredient assigned', () => {
    const { getByText } = renderWithProviders(<SetupPumpsPage />, {
      withSetupReturn: true,
    });

    expect(
      getByText('Pick a liquid to set bottle size and fill for this line.'),
    ).toBeInTheDocument();
  });

  it('surfaces direct assignment errors without opening the swap dialog', async () => {
    applyIngredientSwap.mockRejectedValue(new Error('Assign failed'));

    const user = userEvent.setup();
    const { getByRole, findByText } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 2 ingredient' }),
      'simple',
    );

    expect(await findByText('Assign failed')).toBeInTheDocument();
  });

  it('surfaces swap errors when assign without cleaning fails', async () => {
    applyIngredientSwap.mockRejectedValue(new Error('Swap failed'));

    const user = userEvent.setup();
    const { getByLabelText, getByRole, findByText } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 1 ingredient' }),
      'simple',
    );

    await user.click(
      getByRole('button', { name: 'Assign without cleaning' }),
    );

    expect(await findByText('Swap failed')).toBeInTheDocument();
  });

  it('applies the swap from the line swap wizard', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, getByTestId } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 1 ingredient' }),
      'simple',
    );
    await user.click(getByRole('button', { name: 'Start swap' }));
    await user.click(getByRole('button', { name: 'Apply swap' }));

    expect(applyIngredientSwap).toHaveBeenCalledWith({
      pumpId: 1,
      fromIngredientId: 'bourbon',
      toIngredientId: 'simple',
    });
    expect(getByTestId('line-swap-wizard')).toBeInTheDocument();
  });

  it('closes the swap dialog when cancelled', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, queryByRole } = renderWithProviders(
      <SetupPumpsPage />,
      { withSetupReturn: true },
    );

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 1 ingredient' }),
      'simple',
    );

    await user.click(getByRole('button', { name: 'Cancel' }));

    expect(
      queryByRole('heading', { name: 'Swap to Simple syrup' }),
    ).not.toBeInTheDocument();
  });

  it('closes the prime wizard from the mocked panel', async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByRole, getByTestId, queryByTestId } =
      renderWithProviders(<SetupPumpsPage />, { withSetupReturn: true });

    await user.selectOptions(
      getByRole('combobox', { name: 'Line 2 ingredient' }),
      'simple',
    );
    await user.click(getByRole('button', { name: 'Prime now' }));
    expect(getByTestId('prime-wizard')).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Close prime' }));

    expect(queryByTestId('prime-wizard')).not.toBeInTheDocument();
  });
});
