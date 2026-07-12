export function mutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export class DeviceApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message?: string, code?: string) {
    super(message ?? `Device API error (${status})`);
    this.name = 'DeviceApiError';
    this.status = status;
    this.code = code;
  }
}

export function deviceErrorMessage(error: unknown): string {
  if (error instanceof DeviceApiError) {
    switch (error.status) {
      case 409:
        return 'Machine is busy — wait for the current pour to finish.';
      case 422: {
        const code = error.code?.toLowerCase();
        const text = error.message.toLowerCase();
        if (code === 'not_primed' || text.includes('primed')) {
          return 'Line must be primed before pouring.';
        }
        if (code === 'unassigned' || text.includes('unassigned')) {
          return 'Ingredient is not assigned to a pump line.';
        }
        if (code === 'low_inventory' || text.includes('inventory')) {
          return 'Not enough liquid remaining for this pour.';
        }
        return 'Cannot pour — check ingredients, inventory, or glass.';
      }
      case 503:
        return 'Machine is not safe to pour right now.';
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('409')) {
      return 'Machine is busy — wait for the current pour to finish.';
    }
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return 'Device did not respond in time.';
    }
    if (error.message.includes('status format invalid')) {
      return 'Device returned an unexpected response.';
    }
    return error.message;
  }

  return 'Could not start pour';
}
