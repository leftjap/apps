import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4176',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4176',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
