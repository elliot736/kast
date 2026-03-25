import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1, // Sequential — tests share state
  globalSetup: process.env.SKIP_SETUP ? undefined : './global-setup.ts',
  globalTeardown: process.env.SKIP_SETUP ? undefined : './global-teardown.ts',
  use: {
    baseURL: process.env.API_URL ?? 'http://localhost:3001',
  },
});
