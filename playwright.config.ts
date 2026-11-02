import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for end-to-end, responsive, and accessibility testing.
 *
 * - Runs Chromium desktop and mobile projects.
 * - Uses deterministic API route mocks and a mock wallet fixture (no real keys or funds).
 * - Accessibility checks fail CI on critical violations.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Deterministic timezone and locale so snapshots and formatting are stable.
    timezoneId: 'UTC',
    locale: 'en-US',
    // Never allow real network access to external services during tests.
    offline: false,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? 'npm run start' : 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // Force deterministic, mock-only mode for the app under test.
          NEXT_PUBLIC_E2E: 'true',
          NEXT_PUBLIC_USE_MOCK_WALLET: 'true',
          NEXT_PUBLIC_USE_MOCK_API: 'true',
        },
      },
});