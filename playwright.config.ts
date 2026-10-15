import { defineConfig } from '@playwright/test'

// End-to-end tests drive the real wedge.exe (npm run build:e2e) through
// WebView2's DevTools protocol; see tests/e2e/app.ts.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // When the app can't start at all, every test fails the same way: stop early.
  maxFailures: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
