import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { IpAddressPadDialog } from '@/components/kiosk/ip-address-pad-dialog';
import { renderWithProviders } from '@/test/render';

function ControlledIpAddressDialog({
  onSave,
  onDismiss,
  onOpenChange,
}: {
  onSave: (ip: string) => void;
  onDismiss: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <IpAddressPadDialog
      open
      onOpenChange={onOpenChange}
      value={value}
      onChange={setValue}
      onSave={onSave}
      onDismiss={onDismiss}
    />
  );
}

describe('IpAddressPadDialog', () => {
  it('keeps save disabled until the draft is a valid IPv4 address', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    const { getByRole } = renderWithProviders(
      <ControlledIpAddressDialog
        onSave={onSave}
        onDismiss={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );

    const saveButton = getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '9' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: 'Dot' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '6' }));
    await user.click(getByRole('button', { name: '8' }));
    await user.click(getByRole('button', { name: 'Dot' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: 'Dot' }));
    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '0' }));

    expect(saveButton).not.toBeDisabled();
    await user.click(saveButton);
    expect(onSave).toHaveBeenCalledWith('192.168.1.10');
  });

  it('resets the draft when the operator cancels', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onOpenChange = vi.fn();

    const { getByRole } = renderWithProviders(
      <IpAddressPadDialog
        open
        onOpenChange={onOpenChange}
        value="192.168.1.10"
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    await user.click(getByRole('button', { name: 'Cancel' }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a validation hint for partial addresses', () => {
    const { getByText } = renderWithProviders(
      <IpAddressPadDialog
        open
        onOpenChange={vi.fn()}
        value="192.168"
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(getByText('Enter a valid IP address')).toBeInTheDocument();
  });

  it('dismisses without saving when the dialog closes', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onOpenChange = vi.fn();

    renderWithProviders(
      <IpAddressPadDialog
        open
        onOpenChange={onOpenChange}
        value="192.168.1.10"
        onChange={vi.fn()}
        onSave={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes after a successful save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    const { getByRole } = renderWithProviders(
      <IpAddressPadDialog
        open
        onOpenChange={onOpenChange}
        value="192.168.1.10"
        onChange={vi.fn()}
        onSave={onSave}
        onDismiss={vi.fn()}
      />,
    );

    await user.click(getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('192.168.1.10');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
