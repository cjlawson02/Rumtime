import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { App } from './app';
import { ErrorBoundary } from '@/components/kiosk/error-boundary';
import { MenuCategoryProvider } from '@/hooks/use-menu-category';
import { SetupReturnProvider } from '@/hooks/use-setup-return';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: false,
    },
  },
});

function installGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Kiosk unhandled rejection', event.reason);
  });
}

async function bootstrap() {
  installGlobalErrorHandlers();

  if (import.meta.env.DEV) {
    const { startMockServiceWorker } = await import('@/api/msw/browser');
    await startMockServiceWorker();
  }

  if (import.meta.env.PROD) {
    registerSW({ immediate: true });
  }

  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('Missing #app mount node');
  }

  createRoot(appRoot).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SetupReturnProvider>
            <MenuCategoryProvider>
              <App />
            </MenuCategoryProvider>
          </SetupReturnProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
