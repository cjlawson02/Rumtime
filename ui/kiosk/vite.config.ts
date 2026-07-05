import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function validateSetupPin(mode: string): void {
  const pin = process.env.VITE_SETUP_PIN;
  if (mode === 'production' && pin && !/^\d{4}$/.test(pin)) {
    throw new Error('[kiosk] VITE_SETUP_PIN must be exactly 4 digits when set');
  }
}

function deviceApiRuntimeCaching(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    const pattern = new RegExp(
      `^${parsed.protocol}//${parsed.host.replace(/\./g, '\\.')}/.*`,
      'i',
    );
    return {
      urlPattern: pattern,
      handler: 'NetworkOnly' as const,
    };
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  validateSetupPin(mode);

  const deviceApiBase =
    process.env.VITE_DEVICE_API_BASE ?? 'http://rumtime.local';
  const deviceCacheRule = deviceApiRuntimeCaching(deviceApiBase);
  const runtimeCaching = [
    {
      urlPattern: /^https:\/\/rumtime\.local\/.*/i,
      handler: 'NetworkOnly' as const,
    },
    {
      urlPattern: /^http:\/\/192\.168\.\d+\.\d+\/.*/i,
      handler: 'NetworkOnly' as const,
    },
    {
      urlPattern: /^http:\/\/10\.\d+\.\d+\.\d+\/.*/i,
      handler: 'NetworkOnly' as const,
    },
    ...(deviceCacheRule ? [deviceCacheRule] : []),
  ];

  if (mode === 'production' && !process.env.VITE_SETUP_PIN) {
    console.warn(
      '[kiosk] VITE_SETUP_PIN is unset — setup will be locked in production builds.',
    );
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icons.svg'],
        manifest: {
          name: 'Home bar',
          short_name: 'Home bar',
          description: 'Home cocktail kiosk',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/icons.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
          runtimeCaching,
        },
      }),
    ],
    resolve: {
      alias: {
        '@/api/device-instance': path.resolve(
          __dirname,
          './src/api/device-instance.ts',
        ),
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
