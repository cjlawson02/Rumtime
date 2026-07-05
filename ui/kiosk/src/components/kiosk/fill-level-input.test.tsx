import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FillLevelInput } from '@/components/kiosk/fill-level-input';
import { renderWithProviders } from '@/test/render';

const updateInventoryLevel = vi.fn();

vi.mock('@/hooks/use-device-mutations', () => ({
  useUpdateInventoryLevel: () => ({ mutateAsync: updateInventoryLevel }),
}));

describe('FillLevelInput', () => {
  beforeEach(() => {
    updateInventoryLevel.mockReset();
    updateInventoryLevel.mockResolvedValue(undefined);
  });

  it('opens the fill level editor from the trigger', async () => {
    const user = userEvent.setup();

    const { container, getByRole } = renderWithProviders(
      <FillLevelInput
        ingredientId="bourbon"
        remainingMl={500}
        bottleSizeMl={750}
      />,
    );

    await user.click(container.querySelector('#fill-bourbon')!);

    expect(getByRole('dialog', { name: 'Fill level' })).toBeInTheDocument();
  });

  it('saves an updated fill level', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    const { container, getByRole } = renderWithProviders(
      <FillLevelInput
        ingredientId="bourbon"
        remainingMl={500}
        bottleSizeMl={750}
        onSaved={onSaved}
      />,
    );

    await user.click(container.querySelector('#fill-bourbon')!);
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: '6' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(updateInventoryLevel).toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      remainingMl: 600,
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('reports save failures through onError', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    updateInventoryLevel.mockRejectedValue(new Error('device offline'));

    const { container, getByRole } = renderWithProviders(
      <FillLevelInput
        ingredientId="bourbon"
        remainingMl={500}
        bottleSizeMl={750}
        onError={onError}
      />,
    );

    await user.click(container.querySelector('#fill-bourbon')!);
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: '4' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(onError).toHaveBeenCalledWith('device offline');
  });

  it('closes without saving when the value is unchanged', async () => {
    const user = userEvent.setup();

    const { container, getByRole, queryByRole } = renderWithProviders(
      <FillLevelInput
        ingredientId="bourbon"
        remainingMl={500}
        bottleSizeMl={750}
      />,
    );

    await user.click(container.querySelector('#fill-bourbon')!);
    await user.click(getByRole('button', { name: 'Save' }));

    expect(updateInventoryLevel).not.toHaveBeenCalled();
    expect(queryByRole('dialog', { name: 'Fill level' })).not.toBeInTheDocument();
  });

  it('does not open the editor while disabled', async () => {
    const user = userEvent.setup();

    const { container, getByRole, queryByRole } = renderWithProviders(
      <FillLevelInput
        ingredientId="bourbon"
        remainingMl={500}
        bottleSizeMl={750}
        disabled
      />,
    );

    await user.click(container.querySelector('#fill-bourbon')!);

    expect(queryByRole('dialog', { name: 'Fill level' })).not.toBeInTheDocument();
  });
});
