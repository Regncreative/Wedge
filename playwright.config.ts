import { defineConfig } from '@playwright/test'

// End-to-end tests drive the real stash.exe (npm run build:e2e) through
// WebView2's DevTools protocol; see tests/e2e/app.ts.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})
