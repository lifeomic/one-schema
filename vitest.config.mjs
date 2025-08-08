import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      include: ['src/*.ts'],
      thresholds: {
        branches: 100,
        statements: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
