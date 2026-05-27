import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. */
  use: {
    baseURL: 'http://localhost:3001',
    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'PORT=3001 npm run dev',
    url: 'http://localhost:3001',
    // E2E環境フラグがある場合は、既存サーバーを無視して強制的に再起動する（環境変数の確実な反映のため）
    reuseExistingServer: !process.env.CI && !process.env.E2E_ENV,
    timeout: 120 * 1000,
    // NEXT_PUBLIC_* 変数をフロントエンドの開発サーバーに注入する
    env: {
      BACKEND_PROXY_TARGET: process.env.BACKEND_PROXY_TARGET ?? 'http://localhost:8080',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '/api',
    },
  },
});
