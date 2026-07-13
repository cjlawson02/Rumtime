import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests use fixed env — do not load .env.local (hardware dev overrides).
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@/api/device-instance': path.resolve(
        __dirname,
        './src/api/device-instance.ts',
      ),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    env: {
      VITE_DEVICE_API_BASE: 'http://rumtime.local',
      VITE_SETUP_PIN: '',
      VITE_DEVICE_POLL_MS: '500',
    },
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './.vitest-coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test/**',
        'src/vite-env.d.ts',
        'src/main.tsx',
        'src/api/msw/**',
      ],
    },
  },
});
