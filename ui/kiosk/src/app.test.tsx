import { describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import { App } from '@/app';
import { renderWithProviders } from '@/test/render';

vi.mock('@/hooks/use-device-status', () => ({
  useDeviceStatus: () => ({
    status: { connected: true, bindings: {} },
    error: null,
    loading: false,
    connected: true,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/pages/menu-page', () => ({
  MenuPage: () => <div>Menu page</div>,
}));
vi.mock('@/pages/drink-detail-page', () => ({
  DrinkDetailPage: () => <div>Drink detail page</div>,
}));
vi.mock('@/pages/pour-page', () => ({
  PourPage: () => <div>Pour page</div>,
}));
vi.mock('@/pages/setup-index-page', () => ({
  SetupIndexPage: () => <div>Setup index page</div>,
}));
vi.mock('@/pages/setup-pumps-page', () => ({
  SetupPumpsPage: () => <div>Setup pumps page</div>,
}));
vi.mock('@/pages/setup-calibration-page', () => ({
  SetupCalibrationPage: () => <div>Setup calibration page</div>,
}));
vi.mock('@/pages/setup-cleaning-page', () => ({
  SetupCleaningPage: () => <div>Setup cleaning page</div>,
}));
vi.mock('@/pages/setup-device-page', () => ({
  SetupDevicePage: () => <div>Setup device page</div>,
}));
vi.mock('@/pages/setup-section-page', () => ({
  SetupSectionPage: () => <div>Setup section page</div>,
}));

describe('App', () => {
  it('renders the menu route', async () => {
    const { hook } = memoryLocation({ path: '/', static: true });
    const { findByText } = renderWithProviders(
      <Router hook={hook}>
        <App />
      </Router>,
    );

    expect(await findByText('Menu page')).toBeInTheDocument();
  });

  it('renders setup routes', async () => {
    const { hook } = memoryLocation({ path: '/setup/pumps', static: true });
    const { findByText } = renderWithProviders(
      <Router hook={hook}>
        <App />
      </Router>,
    );

    expect(await findByText('Setup pumps page')).toBeInTheDocument();
  });

  it('renders the not-found screen for unknown paths', async () => {
    const { hook } = memoryLocation({ path: '/missing-page', static: true });
    const { findByText } = renderWithProviders(
      <Router hook={hook}>
        <App />
      </Router>,
    );

    expect(await findByText('Page not found.')).toBeInTheDocument();
    expect(await findByText('Back to menu')).toBeInTheDocument();
  });
});
