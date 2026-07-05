import { describe, expect, it } from 'vitest';

import { sanitizeInternalPath } from '@/lib/safe-href';

describe('sanitizeInternalPath', () => {
  it('allows internal kiosk paths', () => {
    expect(sanitizeInternalPath('/setup/pumps')).toBe('/setup/pumps');
    expect(sanitizeInternalPath('/drink/old-fashioned')).toBe(
      '/drink/old-fashioned',
    );
    expect(sanitizeInternalPath('/drink/v2.recipe')).toBe('/drink/v2.recipe');
    expect(sanitizeInternalPath('/?cat=rum')).toBe('/?cat=rum');
  });

  it('rejects external and protocol URLs', () => {
    expect(sanitizeInternalPath('https://evil.example')).toBeUndefined();
    expect(sanitizeInternalPath('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeInternalPath('//evil.example')).toBeUndefined();
    expect(sanitizeInternalPath(null)).toBeUndefined();
  });
});
