import { afterEach, describe, expect, it, vi } from 'vitest';

describe('setup pin config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfig() {
    return import('@/lib/config');
  }

  it('reports configured when VITE_SETUP_PIN is set', async () => {
    vi.stubEnv('VITE_SETUP_PIN', '1234');
    const { isSetupPinConfigured } = await loadConfig();
    expect(isSetupPinConfigured()).toBe(true);
  });

  it('accepts the configured pin in production', async () => {
    vi.stubEnv('VITE_SETUP_PIN', '1234');
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    const { verifySetupPin } = await loadConfig();
    expect(verifySetupPin('1234')).toBe(true);
    expect(verifySetupPin('0000')).toBe(false);
  });

  it('rejects any pin when unset in production', async () => {
    vi.stubEnv('VITE_SETUP_PIN', '');
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    const { verifySetupPin } = await loadConfig();
    expect(verifySetupPin('1234')).toBe(false);
  });

  it('allows any pin in dev when unset', async () => {
    vi.stubEnv('VITE_SETUP_PIN', '');
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);
    const { verifySetupPin } = await loadConfig();
    expect(verifySetupPin('anything')).toBe(true);
  });
});
