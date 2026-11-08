import { defineConfig, devices } from '@playwright/test';

const port = 8799;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec wrangler dev --ip 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
