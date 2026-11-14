import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/desktop',
  timeout: 90000,
  expect: { timeout: 12000 },
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  outputDir: 'test-results/desktop',
  use: { trace: 'retain-on-failure' }
});
