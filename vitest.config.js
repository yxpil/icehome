import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'node',
    globals: false,
    reporters: ['default'],
    testTimeout: 20000,
    hookTimeout: 20000
  }
});
