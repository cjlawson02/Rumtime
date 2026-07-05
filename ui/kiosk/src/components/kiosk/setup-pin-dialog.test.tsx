import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SetupPinDialog } from '@/components/kiosk/setup-pin-dialog';
import { renderWithProviders } from '@/test/render';

vi.mock('@/lib/config', () => ({
  verifySetupPin: (input: string) => input === '1234',
}));

vi.mock('@/lib/setup-unlock', () => ({
  grantSetupUnlock: vi.fn(),
}));

describe('SetupPinDialog', () => {
  it('unlocks when the operator enters the correct pin', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();

    const { getByRole, queryByText } = renderWithProviders(
      <SetupPinDialog
        open
        onOpenChange={onOpenChange}
        title="Setup PIN"
        description="Enter the 4-digit PIN."
        onSuccess={onSuccess}
      />,
    );

    await user.click(getByRole('button', { name: '1' }));
    await user.click(getByRole('button', { name: '2' }));
    await user.click(getByRole('button', { name: '3' }));
    await user.click(getByRole('button', { name: '4' }));

    expect(onSuccess).toHaveBeenCalledWith('1234');
    expect(queryByText('Wrong PIN — try again')).not.toBeInTheDocument();
  });

  it('shows an error and clears the pin after a wrong attempt', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const { getByRole, getByText } = renderWithProviders(
      <SetupPinDialog
        open
        onOpenChange={vi.fn()}
        title="Setup PIN"
        description="Enter the 4-digit PIN."
        onSuccess={onSuccess}
      />,
    );

    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: '0' }));
    await user.click(getByRole('button', { name: '0' }));

    expect(onSuccess).not.toHaveBeenCalled();
    expect(getByText('Wrong PIN — try again')).toBeInTheDocument();
    expect(getByRole('group', { name: 'PIN number pad' })).toHaveAttribute(
      'aria-label',
      'PIN number pad',
    );
  });

  it('calls onCancel when the operator dismisses the dialog', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    const { getByRole } = renderWithProviders(
      <SetupPinDialog
        open
        onOpenChange={onOpenChange}
        title="Setup PIN"
        description="Enter the 4-digit PIN."
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
