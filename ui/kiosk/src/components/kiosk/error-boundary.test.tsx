import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/kiosk/error-boundary';
import { renderWithProviders } from '@/test/render';

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Render failed');
  }
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const assign = vi.fn();
  const reload = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    reload.mockReset();
    vi.stubGlobal('location', {
      assign,
      reload,
      href: '/pour',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders children when there is no error', () => {
    const { getByText } = renderWithProviders(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(getByText('All good')).toBeInTheDocument();
  });

  it('shows the recovery screen when a child throws', () => {
    const { getByText, getByRole } = renderWithProviders(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    expect(getByText('Something went wrong')).toBeInTheDocument();
    expect(
      getByText(/Return to the menu or reload the kiosk app/i),
    ).toBeInTheDocument();
    expect(getByRole('button', { name: 'Return to menu' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Reload app' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('returns to the menu when the operator taps Return to menu', async () => {
    const user = userEvent.setup();

    const { getByRole } = renderWithProviders(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    await user.click(getByRole('button', { name: 'Return to menu' }));

    expect(assign).toHaveBeenCalledWith('/');
  });

  it('reloads the app when the operator taps Reload app', async () => {
    const user = userEvent.setup();

    const { getByRole } = renderWithProviders(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );

    await user.click(getByRole('button', { name: 'Reload app' }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
