import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
