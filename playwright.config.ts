import { defineConfig, devices } from 'playwright/test';

/**
 * TESTPILOT AI — Playwright E2E configuration.
 *
 * Runs Chromium against the local dev server (API 4318 + Web 4317).
 * Tests must NOT mutate production data. A separate test data directory
 * (TESTPILOT_DATA_DIR) is recommended so E2E runs are isolated.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4318/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
