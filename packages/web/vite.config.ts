/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/App.tsx',
        'src/vite-env.d.ts',
        'src/test-setup.ts',
        'src/test-utils.tsx',
        'src/mocks/**',
        'src/router.tsx',
        'src/components/layout/AppShell.tsx',
        '**/*.test.{ts,tsx}',
      ],
      thresholds: {
        lines: 60,
        branches: 60,
        functions: 60,
        statements: 60,
      },
    },
  },
});
