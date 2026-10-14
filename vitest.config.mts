import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    coverage: {
      provider: 'v8',
      // Pure frontend logic; the Rust backend has its own tests (npm run test:rust)
      // and the UI wiring is exercised by the Playwright suite.
      include: ['src/shared/**', 'src/renderer/src/lib/**'],
      exclude: ['src/renderer/src/lib/i18n.ts', 'src/renderer/src/lib/api.ts', 'src/shared/ipc.ts'],
      thresholds: { lines: 70, branches: 70 }
    }
  }
})
