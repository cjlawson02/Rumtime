import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NumberPadDialog } from '@/components/kiosk/number-pad-dialog';
import { renderWithProviders } from '@/test/render';

function ControlledNumberPadDialog({
  onSave,
  onCancel,
  onOpenChange,
  initialValue = '',
  saving = false,
}: {
  onSave: () => void;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
  initialValue?: string;
  saving?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <NumberPadDialog
      open
      onOpenChange={onOpenChange}
      title="Enter volume"
      description="Use the number pad below."
      value={value}
      onChange={setValue}
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      suffix="ml"
      allowDecimal
      maxLength={6}
    />
  );
}

describe('NumberPadDialog', () => {
  it('updates the draft value from the number pad', async () => {
    const user = userEvent.setup();

    const { getByRole, getByText } = renderWithProviders(
      <ControlledNumberPadDialog
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(getByRole('button', { name: '4' }));
    await user.click(getByRole('button', { name: '2' }));

    expect(getByText('42', { exact: false })).toBeInTheDocument();
    expect(getByText('ml')).toBeInTheDocument();
  });

  it('calls onSave when the operator confirms', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    const { getByRole } = renderWithProviders(
      <ControlledNumberPadDialog
        onSave={onSave}
        onCancel={vi.fn()}
        onOpenChange={vi.fn()}
        initialValue="42"
      />,
    );

    await user.click(getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the operator dismisses the dialog', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    const { getByRole } = renderWithProviders(
      <NumberPadDialog
        open
        onOpenChange={onOpenChange}
        title="Enter volume"
        value="42"
        onChange={vi.fn()}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('calls onCancel when the shell closes without saving', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    renderWithProviders(
      <NumberPadDialog
        open
        onOpenChange={onOpenChange}
        title="Enter volume"
        value="42"
        onChange={vi.fn()}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables the number pad while saving', () => {
    const { getByRole } = renderWithProviders(
      <ControlledNumberPadDialog
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onOpenChange={vi.fn()}
        saving
      />,
    );

    expect(getByRole('button', { name: '1' })).toBeDisabled();
    expect(getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
