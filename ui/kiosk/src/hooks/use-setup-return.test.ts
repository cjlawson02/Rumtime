import { describe, expect, it } from 'vitest';

import {
  sanitizeReturnPath,
  setupSectionPath,
  SETUP_ROOT,
} from '@/hooks/use-setup-return';

describe('sanitizeReturnPath', () => {
  it('allows in-app relative paths', () => {
    expect(sanitizeReturnPath('/drink/old-fashioned')).toBe(
      '/drink/old-fashioned',
    );
    expect(sanitizeReturnPath('/?cat=rum')).toBe('/?cat=rum');
  });

  it('rejects external and protocol-relative paths', () => {
    expect(sanitizeReturnPath('//evil.example/phish')).toBe('/');
    expect(sanitizeReturnPath('https://evil.example')).toBe('/');
    expect(sanitizeReturnPath(null)).toBe('/');
  });
});

describe('setup paths', () => {
  it('uses plain routes without query params', () => {
    expect(SETUP_ROOT).toBe('/setup');
    expect(setupSectionPath('pumps')).toBe('/setup/pumps');
  });
});
