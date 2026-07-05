import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';

import {
  MenuCategoryProvider,
  useMenuCategory,
} from '@/hooks/use-menu-category';

function wrapper({ children }: { children: ReactNode }) {
  return <MenuCategoryProvider>{children}</MenuCategoryProvider>;
}

describe('useMenuCategory', () => {
  it('provides the active category and updates it', () => {
    const { result } = renderHook(() => useMenuCategory(), { wrapper });

    expect(result.current.category).toBe('all');

    act(() => {
      result.current.setCategory('rum');
    });

    expect(result.current.category).toBe('rum');
  });

  it('throws when used outside MenuCategoryProvider', () => {
    expect(() => renderHook(() => useMenuCategory())).toThrow(
      'MenuCategoryProvider is missing',
    );
  });
});
