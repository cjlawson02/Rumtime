import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from '@/components/kiosk/notification-center';
import type { KioskNotification } from '@/lib/notifications';
import { renderWithProviders } from '@/test/render';

vi.mock('wouter', () => ({
  useLocation: () => ['/', vi.fn()],
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const infoNotification: KioskNotification = {
  id: 'info-1',
  severity: 'info',
  title: 'Menu updated',
  detail: 'New recipes are available.',
  source: 'menu',
};

const warningNotification: KioskNotification = {
  id: 'warn-1',
  severity: 'warning',
  title: 'Low inventory',
  detail: 'Rum is running low.',
  actionHref: '/drink/daiquiri',
  actionLabel: 'View drink',
  source: 'menu',
};

const setupNotification: KioskNotification = {
  id: 'setup-1',
  severity: 'error',
  title: 'Line not primed',
  detail: 'Prime the gin line before pouring.',
  actionHref: '/setup/pumps',
  actionLabel: 'Open bottle bay',
  source: 'device',
};

describe('NotificationCenter', () => {
  it('renders nothing when there are no notifications', () => {
    const { container } = renderWithProviders(
      <NotificationCenter notifications={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('uses urgent styling for error and warning notifications', () => {
    const { getByRole } = renderWithProviders(
      <NotificationCenter notifications={[setupNotification]} />,
    );

    const trigger = getByRole('button', { name: '1 notifications' });
    expect(trigger.className).toContain('border-red-500/40');
  });

  it('uses info styling when only informational alerts are present', () => {
    const { getByRole } = renderWithProviders(
      <NotificationCenter notifications={[infoNotification]} />,
    );

    const trigger = getByRole('button', { name: '1 notifications' });
    expect(trigger.className).toContain('border-sky-500/40');
  });

  it('opens the dialog and lists notification details', async () => {
    const user = userEvent.setup();
    const { getByRole, getByText } = renderWithProviders(
      <NotificationCenter
        notifications={[infoNotification, warningNotification]}
      />,
    );

    await user.click(getByRole('button', { name: '2 notifications' }));

    expect(getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(getByText('Menu updated')).toBeInTheDocument();
    expect(getByText('New recipes are available.')).toBeInTheDocument();
    expect(getByText('Low inventory')).toBeInTheDocument();
  });

  it('renders setup and in-app action links', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderWithProviders(
      <NotificationCenter
        notifications={[setupNotification, warningNotification]}
      />,
      { withSetupReturn: true },
    );

    await user.click(getByRole('button', { name: '2 notifications' }));

    expect(getByRole('link', { name: 'Open bottle bay' })).toHaveAttribute(
      'href',
      '/setup/pumps',
    );
    expect(getByRole('link', { name: 'View drink' })).toHaveAttribute(
      'href',
      '/drink/daiquiri',
    );
  });

  it('closes the dialog when an action link is clicked', async () => {
    const user = userEvent.setup();
    const { getByRole, queryByRole } = renderWithProviders(
      <NotificationCenter notifications={[warningNotification]} />,
    );

    await user.click(getByRole('button', { name: '1 notifications' }));
    expect(getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();

    await user.click(getByRole('link', { name: 'View drink' }));

    expect(
      queryByRole('heading', { name: 'Notifications' }),
    ).not.toBeInTheDocument();
  });
});
