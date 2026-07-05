import { describe, expect, it, vi } from 'vitest';

import { SETUP_ROOT } from '@/hooks/use-setup-return';
import { SetupSectionPage } from '@/pages/setup-section-page';
import { renderWithProviders } from '@/test/render';

const { routeSection } = vi.hoisted(() => ({
  routeSection: { current: 'inventory' },
}));

vi.mock('@/lib/setup-unlock', () => ({
  hasSetupUnlock: () => true,
  grantSetupUnlock: vi.fn(),
}));

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({ status: undefined }),
}));

vi.mock('wouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wouter')>();
  return {
    ...actual,
    useRoute: () => [true, { section: routeSection.current }],
    useLocation: () => ['/', vi.fn()],
    Redirect: ({ to }: { to: string }) => (
      <div data-testid="redirect" data-to={to} />
    ),
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
  };
});

vi.mock('@/data/setup-sections', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/data/setup-sections')>();
  return {
    ...actual,
    getSetupSection: (id: string) => {
      if (id === 'inventory') {
        return {
          id: 'inventory',
          title: 'Inventory',
          icon: '📦',
          subtitle: 'Stock levels',
          description: 'Track what is left in each bottle.',
        };
      }
      return actual.getSetupSection(id);
    },
  };
});

describe('SetupSectionPage', () => {
  it('redirects dedicated sections to their canonical routes', () => {
    routeSection.current = 'pumps';

    const { getByTestId } = renderWithProviders(<SetupSectionPage />, {
      withSetupReturn: true,
    });

    expect(getByTestId('redirect')).toHaveAttribute(
      'data-to',
      '/setup/pumps',
    );
  });

  it('renders the section wrapper for generic setup sections', () => {
    routeSection.current = 'inventory';

    const { getByText } = renderWithProviders(<SetupSectionPage />, {
      withSetupReturn: true,
    });

    expect(getByText('Inventory')).toBeInTheDocument();
    expect(getByText('Stock levels')).toBeInTheDocument();
    expect(
      getByText('Track what is left in each bottle.'),
    ).toBeInTheDocument();
  });

  it('shows not found for unknown sections', () => {
    routeSection.current = 'unknown-section';

    const { getByText, getByRole } = renderWithProviders(
      <SetupSectionPage />,
      { withSetupReturn: true },
    );

    expect(getByText('Setup section not found.')).toBeInTheDocument();
    expect(getByRole('link', { name: 'Back to setup' })).toHaveAttribute(
      'href',
      SETUP_ROOT,
    );
  });
});
