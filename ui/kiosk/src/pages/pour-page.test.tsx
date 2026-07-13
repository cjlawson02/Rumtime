import { act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeviceStatus } from '@/api/types';
import { PourPage } from '@/pages/pour-page';
import { renderWithProviders } from '@/test/render';

const {
  navigate,
  startPourMutate,
  cancelPourMutate,
  acknowledgePromptMutate,
  fetchDeviceStatus,
  routeId,
  deviceState,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  startPourMutate: vi.fn(),
  cancelPourMutate: vi.fn(),
  acknowledgePromptMutate: vi.fn(),
  fetchDeviceStatus: vi.fn(),
  routeId: { current: 'old-fashioned' },
  deviceState: {
    status: undefined as DeviceStatus | undefined,
    error: null as string | null,
  },
}));

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: routeId.current }],
  useSearch: () => '',
  useLocation: () => [`/pour/${routeId.current}`, navigate],
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

vi.mock('@/hooks/use-device-status', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/use-device-status')>();
  return {
    ...actual,
    useDeviceStatus: () => ({
      status: deviceState.status,
      error: deviceState.error,
      loading: false,
      connected: deviceState.status?.connected ?? false,
      refresh: vi.fn(),
    }),
    fetchDeviceStatus,
  };
});

vi.mock('@/hooks/use-device-mutations', () => ({
  useStartPour: () => ({ mutateAsync: startPourMutate }),
  useCancelPour: () => ({ mutateAsync: cancelPourMutate }),
  useAcknowledgePrompt: () => ({ mutateAsync: acknowledgePromptMutate }),
}));

const pourReadyDevice: DeviceStatus = {
  connected: true,
  bindings: {
    bourbon: {
      ingredientId: 'bourbon',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    simple: {
      ingredientId: 'simple',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  pumps: [
    { pumpId: 1, ingredientId: 'bourbon' },
    { pumpId: 2, ingredientId: 'simple' },
  ],
  job: null,
};

const ginTonicDevice: DeviceStatus = {
  connected: true,
  bindings: {
    gin: {
      ingredientId: 'gin',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  pumps: [{ pumpId: 1, ingredientId: 'gin' }],
  job: null,
};

const margaritaDevice: DeviceStatus = {
  connected: true,
  bindings: {
    tequila: {
      ingredientId: 'tequila',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
    triple_sec: {
      ingredientId: 'triple_sec',
      remainingMl: 750,
      bottleSizeMl: 750,
      primed: true,
    },
  },
  pumps: [
    { pumpId: 1, ingredientId: 'tequila' },
    { pumpId: 2, ingredientId: 'triple_sec' },
  ],
  job: null,
};

describe('PourPage', () => {
  beforeEach(() => {
    vi.useRealTimers();
    routeId.current = 'old-fashioned';
    navigate.mockReset();
    startPourMutate.mockReset();
    cancelPourMutate.mockReset();
    acknowledgePromptMutate.mockReset();
    fetchDeviceStatus.mockReset();
    startPourMutate.mockResolvedValue(undefined);
    cancelPourMutate.mockResolvedValue(undefined);
    acknowledgePromptMutate.mockResolvedValue(undefined);
    fetchDeviceStatus.mockResolvedValue(pourReadyDevice);
    deviceState.status = pourReadyDevice;
    deviceState.error = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the ice pre-pour step before starting the machine pour', async () => {
    const user = userEvent.setup();
    const { getByText, getByRole } = renderWithProviders(<PourPage />);

    expect(getByText('Add ice')).toBeInTheDocument();
    expect(getByText(/Fill your glass with ice/i)).toBeInTheDocument();

    await user.click(getByRole('button', { name: 'Done' }));

    expect(startPourMutate).toHaveBeenCalledWith({
      recipeId: 'old-fashioned',
      steps: [
        { ingredientId: 'bourbon', ml: 45 },
        { ingredientId: 'simple', ml: 10 },
      ],
    });
  });

  it('shows pour progress while the machine is dispensing', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 55,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Pouring gin')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows the post-pour manual step after the machine finishes', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 40,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'complete',
        progress: 100,
        stepLabel: 'Done',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Tonic water')).toBeInTheDocument();
    expect(view.getByText(/Top with/i)).toBeInTheDocument();
  });

  it('surfaces start errors when inventory blocks the pour', async () => {
    const user = userEvent.setup();
    fetchDeviceStatus.mockResolvedValue({
      ...pourReadyDevice,
      bindings: {
        bourbon: {
          ingredientId: 'bourbon',
          remainingMl: 5,
          bottleSizeMl: 750,
          primed: true,
        },
        simple: {
          ingredientId: 'simple',
          remainingMl: 750,
          bottleSizeMl: 750,
          primed: true,
        },
      },
    });

    const { getByRole, findByText } = renderWithProviders(<PourPage />);
    await user.click(getByRole('button', { name: 'Done' }));

    expect(await findByText(/Bourbon low/i)).toBeInTheDocument();
    expect(startPourMutate).not.toHaveBeenCalled();
  });

  it('keeps inventory bypass across a remount and consumes it after start', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
    const { grantPourInventoryBypass, peekPourInventoryBypass } = await import(
      '@/lib/pour-inventory-bypass'
    );
    grantPourInventoryBypass('old-fashioned');

    fetchDeviceStatus.mockResolvedValue({
      ...pourReadyDevice,
      bindings: {
        bourbon: {
          ingredientId: 'bourbon',
          remainingMl: 5,
          bottleSizeMl: 750,
          primed: true,
        },
        simple: {
          ingredientId: 'simple',
          remainingMl: 750,
          bottleSizeMl: 750,
          primed: true,
        },
      },
    });

    const user = userEvent.setup();
    const first = renderWithProviders(<PourPage />);
    first.unmount();

    expect(peekPourInventoryBypass('old-fashioned')).toBe(true);

    const view = renderWithProviders(<PourPage />);
    await user.click(view.getByRole('button', { name: 'Done' }));

    expect(startPourMutate).toHaveBeenCalled();
    expect(peekPourInventoryBypass('old-fashioned')).toBe(false);

    vi.unstubAllGlobals();
  });

  it('cancels an active pour and returns to the drink screen', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 40,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Cancel' }));

    expect(cancelPourMutate).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/drink/gin-tonic');
  });

  it('shows the cancelled state when the machine reports pour cancelled', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 10,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'cancelled',
        progress: 0,
        stepLabel: 'Cancelled',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Pour cancelled.')).toBeInTheDocument();
    expect(
      view.getByRole('link', { name: 'Back to drink' }),
    ).toHaveAttribute('href', '/drink/gin-tonic');
  });

  it('does not sticky-cancel when remounting while a previous cancelled job is still in status', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue({
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'cancelled',
        progress: 0,
        stepLabel: 'Cancelled',
      },
    });
    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'cancelled',
        progress: 0,
        stepLabel: 'Cancelled',
      },
    };

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    expect(view.queryByText('Pour cancelled.')).not.toBeInTheDocument();

    await user.click(view.getByRole('button', { name: 'Done' }));
    expect(startPourMutate).toHaveBeenCalled();

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 20,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Pouring gin')).toBeInTheDocument();
    expect(view.queryByText('Pour cancelled.')).not.toBeInTheDocument();
  });

  it('latches complete without an intermediate pouring poll', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));
    expect(startPourMutate).toHaveBeenCalled();

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'complete',
        progress: 100,
        stepLabel: 'Done',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Tonic water')).toBeInTheDocument();
    expect(view.queryByText('Waiting for pour to start…')).not.toBeInTheDocument();
  });

  it('shows pouring after start while a prior cancelled job is still in cache', async () => {
    routeId.current = 'gin-tonic';
    const cancelledStatus = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic' as const,
        state: 'cancelled' as const,
        progress: 0,
        stepLabel: 'Cancelled',
      },
    };
    fetchDeviceStatus.mockResolvedValue(cancelledStatus);
    deviceState.status = cancelledStatus;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));
    expect(startPourMutate).toHaveBeenCalled();
    expect(view.queryByText('Pour cancelled.')).not.toBeInTheDocument();
    expect(view.getByText('Waiting for pour to start…')).toBeInTheDocument();

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 15,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Pouring gin')).toBeInTheDocument();
  });

  it('shows interrupted when an active pour disappears from status', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 10,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);
    expect(view.getByText('Pouring gin')).toBeInTheDocument();

    deviceState.status = { ...ginTonicDevice, job: null };
    view.rerender(<PourPage />);

    expect(
      view.getByText(
        'Pour stopped unexpectedly. Check the glass and scale, then try again.',
      ),
    ).toBeInTheDocument();
    expect(
      view.queryByText('Waiting for pour to start…'),
    ).not.toBeInTheDocument();
  });

  it('keeps the flow-timeout error after the terminal job latch clears', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 0,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'error',
        progress: 0,
        stepLabel: 'No flow detected — check glass and scale',
      },
    };
    view.rerender(<PourPage />);
    expect(
      view.getByText('No flow detected — check glass and scale'),
    ).toBeInTheDocument();

    deviceState.status = { ...ginTonicDevice, job: null };
    view.rerender(<PourPage />);

    expect(
      view.getByText('No flow detected — check glass and scale'),
    ).toBeInTheDocument();
    expect(
      view.queryByText(
        'Pour stopped unexpectedly. Check the glass and scale, then try again.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows a timeout message when the pour job never starts', async () => {
    vi.useFakeTimers();

    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const view = renderWithProviders(<PourPage />);

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Done' }));
      await Promise.resolve();
    });

    expect(view.getByText('Waiting for pour to start…')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15000);
    });
    view.rerender(<PourPage />);

    expect(
      view.getByText(
        'Pour did not start. Check the machine or try again from the drink screen.',
      ),
    ).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('keeps the complete screen after the terminal job latch clears', async () => {
    vi.useFakeTimers();

    routeId.current = 'margarita';
    fetchDeviceStatus.mockResolvedValue(margaritaDevice);
    deviceState.status = margaritaDevice;

    const view = renderWithProviders(<PourPage />);

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Done' }));
      await Promise.resolve();
    });

    deviceState.status = {
      ...margaritaDevice,
      job: {
        recipeId: 'margarita',
        state: 'pouring',
        progress: 20,
        stepLabel: 'Pouring tequila',
      },
    };
    view.rerender(<PourPage />);

    deviceState.status = {
      ...margaritaDevice,
      job: {
        recipeId: 'margarita',
        state: 'complete',
        progress: 100,
        stepLabel: 'Done',
      },
    };
    view.rerender(<PourPage />);
    expect(view.getByText('Enjoy your Margarita')).toBeInTheDocument();

    deviceState.status = { ...margaritaDevice, job: null };
    view.rerender(<PourPage />);

    expect(view.getByText('Enjoy your Margarita')).toBeInTheDocument();
    expect(
      view.queryByText(
        'Pour stopped unexpectedly. Check the glass and scale, then try again.',
      ),
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('returns to the menu after a pour completes without post-pour steps', async () => {
    vi.useFakeTimers();

    routeId.current = 'margarita';
    fetchDeviceStatus.mockResolvedValue(margaritaDevice);
    deviceState.status = margaritaDevice;

    const view = renderWithProviders(<PourPage />);

    await act(async () => {
      fireEvent.click(view.getByRole('button', { name: 'Done' }));
      await Promise.resolve();
    });

    deviceState.status = {
      ...margaritaDevice,
      job: {
        recipeId: 'margarita',
        state: 'pouring',
        progress: 50,
        stepLabel: 'Pouring tequila',
      },
    };
    view.rerender(<PourPage />);

    deviceState.status = {
      ...margaritaDevice,
      job: {
        recipeId: 'margarita',
        state: 'complete',
        progress: 100,
        stepLabel: 'Done',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Enjoy your Margarita')).toBeInTheDocument();
    expect(view.getByText('Returning to menu…')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(navigate).toHaveBeenCalledWith('/');
    vi.useRealTimers();
  });

  it('returns to the drink screen when the pre-pour step is cancelled', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderWithProviders(<PourPage />);

    await user.click(getByRole('button', { name: 'Back' }));

    expect(navigate).toHaveBeenCalledWith('/drink/old-fashioned');
    expect(startPourMutate).not.toHaveBeenCalled();
  });

  it('surfaces cancel errors without leaving the pour screen', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;
    cancelPourMutate.mockRejectedValue(new Error('Cancel failed'));

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'pouring',
        progress: 20,
        stepLabel: 'Pouring gin',
      },
    };
    view.rerender(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Cancel' }));

    expect(view.getByText('Cancel failed')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows finishing state when the machine prompts without manual post steps', async () => {
    routeId.current = 'margarita';
    fetchDeviceStatus.mockResolvedValue(margaritaDevice);
    deviceState.status = margaritaDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...margaritaDevice,
      job: {
        recipeId: 'margarita',
        state: 'prompt',
        progress: 100,
        stepLabel: 'Prompt',
      },
    };
    view.rerender(<PourPage />);

    expect(view.getByText('Finishing up…')).toBeInTheDocument();
  });

  it('surfaces auto-acknowledge errors when finishing without manual post steps', async () => {
    routeId.current = 'margarita';
    fetchDeviceStatus.mockResolvedValue(margaritaDevice);
    deviceState.status = margaritaDevice;
    acknowledgePromptMutate.mockRejectedValue(new Error('Prompt failed'));

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...margaritaDevice,
      job: {
        recipeId: 'margarita',
        state: 'prompt',
        progress: 100,
        stepLabel: 'Prompt',
      },
    };
    view.rerender(<PourPage />);

    expect(await view.findByText('Prompt failed')).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('completes the flow after the final post-pour manual step', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'prompt',
        progress: 100,
        stepLabel: 'Top off',
      },
    };
    view.rerender(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    expect(acknowledgePromptMutate).toHaveBeenCalled();
    expect(view.getByText('Enjoy your Gin & Tonic')).toBeInTheDocument();
  });

  it('surfaces post-pour acknowledge errors on the manual step', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);
    deviceState.status = ginTonicDevice;
    acknowledgePromptMutate.mockRejectedValue(new Error('Prompt failed'));

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'gin-tonic',
        state: 'prompt',
        progress: 100,
        stepLabel: 'Top off',
      },
    };
    view.rerender(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    expect(view.getByText('Prompt failed')).toBeInTheDocument();
  });

  it('shows a back link when the recipe id is unknown', () => {
    routeId.current = 'missing-drink';

    const { getByRole } = renderWithProviders(<PourPage />);

    expect(getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/');
  });

  it('shows device offline when starting a pour without connectivity', async () => {
    const user = userEvent.setup();
    deviceState.status = { ...pourReadyDevice, connected: false };
    deviceState.error = 'Device offline';

    const { getByRole, findByText } = renderWithProviders(<PourPage />);
    await user.click(getByRole('button', { name: 'Done' }));

    expect(await findByText('Device offline')).toBeInTheDocument();
    expect(startPourMutate).not.toHaveBeenCalled();
  });

  it('shows a status verification error when the device cannot be rechecked', async () => {
    const user = userEvent.setup();
    fetchDeviceStatus.mockRejectedValue(new Error('network'));

    const { getByRole, findByText } = renderWithProviders(<PourPage />);
    await user.click(getByRole('button', { name: 'Done' }));

    expect(
      await findByText('Could not verify device status — try again.'),
    ).toBeInTheDocument();
    expect(startPourMutate).not.toHaveBeenCalled();
  });

  it('blocks starting a pour when the machine is already pouring', async () => {
    const user = userEvent.setup();
    fetchDeviceStatus.mockResolvedValue({
      ...pourReadyDevice,
      job: {
        recipeId: 'margarita',
        state: 'pouring',
        progress: 10,
        stepLabel: 'Pouring tequila',
      },
    });

    const { getByRole, findByText } = renderWithProviders(<PourPage />);
    await user.click(getByRole('button', { name: 'Done' }));

    expect(
      await findByText(
        'Machine is busy — wait for the current pour to finish.',
      ),
    ).toBeInTheDocument();
    expect(startPourMutate).not.toHaveBeenCalled();
  });

  it('blocks starting a pour when setup is running on the machine', async () => {
    const user = userEvent.setup();
    fetchDeviceStatus.mockResolvedValue({
      ...pourReadyDevice,
      pumpJob: { state: 'running', purpose: 'prime', pumpId: 1 },
    });

    const { getByRole, findByText } = renderWithProviders(<PourPage />);
    await user.click(getByRole('button', { name: 'Done' }));

    expect(
      await findByText(
        'Machine is busy in setup — finish setup before pouring.',
      ),
    ).toBeInTheDocument();
    expect(startPourMutate).not.toHaveBeenCalled();
  });

  it('surfaces start errors when the pour request fails', async () => {
    const user = userEvent.setup();
    startPourMutate.mockRejectedValue(new Error('Start failed'));

    const { getByRole, findByText } = renderWithProviders(<PourPage />);
    await user.click(getByRole('button', { name: 'Done' }));

    expect(await findByText('Start failed')).toBeInTheDocument();
  });

  it('shows a busy message when another pour is active', async () => {
    routeId.current = 'gin-tonic';
    fetchDeviceStatus.mockResolvedValue(ginTonicDevice);

    const user = userEvent.setup();
    const view = renderWithProviders(<PourPage />);

    await user.click(view.getByRole('button', { name: 'Done' }));

    deviceState.status = {
      ...ginTonicDevice,
      job: {
        recipeId: 'margarita',
        state: 'pouring',
        progress: 10,
        stepLabel: 'Pouring tequila',
      },
    };
    view.rerender(<PourPage />);

    expect(
      view.getByText(
        'Machine is pouring another drink — wait or cancel it first.',
      ),
    ).toBeInTheDocument();
  });
});
