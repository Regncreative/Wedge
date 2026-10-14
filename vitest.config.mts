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
      // Core logic only; Electron-bound modules (window, tray, IPC wiring)
      // are exercised by the Playwright suite instead.
      include: [
        'src/main/database/**',
        'src/main/file-exists.ts',
        'src/main/ipc-schemas.ts',
        'src/shared/**',
        'src/renderer/src/lib/**'
      ],
      exclude: ['src/renderer/src/lib/i18n.ts', 'src/shared/ipc.ts'],
      thresholds: { lines: 70, branches: 70 }
    }
  }
})
