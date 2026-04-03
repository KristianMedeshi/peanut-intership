import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
    },
  },
});
