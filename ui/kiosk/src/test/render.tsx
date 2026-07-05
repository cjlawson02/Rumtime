import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { MenuCategoryProvider } from '@/hooks/use-menu-category';
import { SetupReturnProvider } from '@/hooks/use-setup-return';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

type WrapperOptions = {
  queryClient?: QueryClient;
  withMenuCategory?: boolean;
  withSetupReturn?: boolean;
};

export function createWrapper({
  queryClient,
  withMenuCategory = false,
  withSetupReturn = false,
}: WrapperOptions = {}) {
  const client = queryClient ?? createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    let content = (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    if (withSetupReturn) {
      content = <SetupReturnProvider>{content}</SetupReturnProvider>;
    }
    if (withMenuCategory) {
      content = <MenuCategoryProvider>{content}</MenuCategoryProvider>;
    }
    return content;
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & WrapperOptions,
) {
  const { queryClient, withMenuCategory, withSetupReturn, ...renderOptions } =
    options ?? {};
  return render(ui, {
    wrapper: createWrapper({ queryClient, withMenuCategory, withSetupReturn }),
    ...renderOptions,
  });
}
