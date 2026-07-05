import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BottleSizeInput } from '@/components/kiosk/bottle-size-input';
import { renderWithProviders } from '@/test/render';

const updateBottleSize = vi.fn();

vi.mock('@/hooks/use-device-mutations', () => ({
  useUpdateBottleSize: () => ({ mutateAsync: updateBottleSize }),
}));

describe('BottleSizeInput', () => {
  beforeEach(() => {
    updateBottleSize.mockReset();
    updateBottleSize.mockResolvedValue(undefined);
  });

  it('saves a preset bottle size from the select control', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    const { getByLabelText } = renderWithProviders(
      <BottleSizeInput
        ingredientId="bourbon"
        bottleSizeMl={750}
        inputId="bourbon-size"
        onSaved={onSaved}
      />,
    );

    await user.selectOptions(getByLabelText('Bottle size'), '1000');

    expect(updateBottleSize).toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      bottleSizeMl: 1000,
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('opens the custom editor when Custom is selected', async () => {
    const user = userEvent.setup();

    const { getByLabelText, getByRole } = renderWithProviders(
      <BottleSizeInput
        ingredientId="bourbon"
        bottleSizeMl={750}
        inputId="bourbon-size"
      />,
    );

    await user.selectOptions(getByLabelText('Bottle size'), 'custom');

    expect(getByRole('dialog', { name: 'Bottle size' })).toBeInTheDocument();
  });

  it('saves a custom bottle size from the number pad', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    const { getByLabelText, getByRole } = renderWithProviders(
      <BottleSizeInput
        ingredientId="bourbon"
        bottleSizeMl={900}
        inputId="bourbon-size"
        onSaved={onSaved}
      />,
    );

    await user.selectOptions(getByLabelText('Bottle size'), 'custom');
    await user.click(getByRole('button', { name: 'Clear' }));
    await user.click(getByRole('button', { name: '5' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: 'Save' }));

    expect(updateBottleSize).toHaveBeenCalledWith({
      ingredientId: 'bourbon',
      bottleSizeMl: 500,
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('restores the previous selection when custom entry is cancelled', async () => {
    const user = userEvent.setup();

    const { getByLabelText, getByRole } = renderWithProviders(
      <BottleSizeInput
        ingredientId="bourbon"
        bottleSizeMl={750}
        inputId="bourbon-size"
      />,
    );

    await user.selectOptions(getByLabelText('Bottle size'), 'custom');
    await user.click(getByRole('button', { name: 'Cancel' }));

    expect(getByLabelText('Bottle size')).toHaveValue('750');
    expect(updateBottleSize).not.toHaveBeenCalled();
  });

  it('reports save failures through onError', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    updateBottleSize.mockRejectedValue(new Error('device offline'));

    const { getByLabelText } = renderWithProviders(
      <BottleSizeInput
        ingredientId="bourbon"
        bottleSizeMl={750}
        inputId="bourbon-size"
        onError={onError}
      />,
    );

    await user.selectOptions(getByLabelText('Bottle size'), '1000');

    expect(onError).toHaveBeenCalledWith('device offline');
  });
});
