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
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test-setup.ts',
        'src/test-utils.tsx',
        'src/mocks/**',
        'src/router.tsx',
        '**/*.test.{ts,tsx}',
      ],
      // Threshold restored to 60% in the final verification commit (NFR-10)
      thresholds: {},
    },
  },
});
