import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

import type { CategoryId } from '@/data/categories';

type MenuCategoryContextValue = {
  category: CategoryId;
  setCategory: (category: CategoryId) => void;
};

const MenuCategoryContext = createContext<MenuCategoryContextValue | null>(
  null,
);

export function MenuCategoryProvider({ children }: { children: ReactNode }) {
  const [category, setCategoryState] = useState<CategoryId>('all');

  const setCategory = useCallback((next: CategoryId) => {
    setCategoryState(next);
  }, []);

  return (
    <MenuCategoryContext.Provider value={{ category, setCategory }}>
      {children}
    </MenuCategoryContext.Provider>
  );
}

export function useMenuCategory(): MenuCategoryContextValue {
  const value = useContext(MenuCategoryContext);
  if (!value) {
    throw new Error('MenuCategoryProvider is missing');
  }
  return value;
}
