import { describe, expect, it, vi } from 'vitest';

import { SETUP_INDEX, SETUP_SECTIONS } from '@/data/setup-sections';
import { setupSectionPath } from '@/hooks/use-setup-return';
import { SetupIndexPage } from '@/pages/setup-index-page';
import { renderWithProviders } from '@/test/render';

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
  };
});

describe('SetupIndexPage', () => {
  it('lists setup sections with titles and descriptions', () => {
    const { getByText } = renderWithProviders(<SetupIndexPage />, {
      withSetupReturn: true,
    });

    expect(getByText(SETUP_INDEX.title)).toBeInTheDocument();
    expect(getByText(SETUP_INDEX.subtitle)).toBeInTheDocument();
    expect(getByText(SETUP_INDEX.description)).toBeInTheDocument();

    for (const section of SETUP_SECTIONS) {
      expect(getByText(section.title)).toBeInTheDocument();
      expect(getByText(section.subtitle)).toBeInTheDocument();
    }
  });

  it('links each section to its setup path', () => {
    const { getByRole } = renderWithProviders(<SetupIndexPage />, {
      withSetupReturn: true,
    });

    for (const section of SETUP_SECTIONS) {
      const link = getByRole('link', { name: new RegExp(section.title) });
      expect(link).toHaveAttribute('href', setupSectionPath(section.id));
    }
  });
});
