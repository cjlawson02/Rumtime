import { setupWorker } from 'msw/browser';

import { deviceHandlers } from '@/api/msw/handlers';

const worker = setupWorker(...deviceHandlers);

export async function startMockServiceWorker() {
  return worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}
