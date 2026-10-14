import { expect, test } from '@playwright/test'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { appEnv, EXE, launchApp, removeProfile, waitForExit } from './app'

test('a second launch exits at once and opens the running panel', async () => {
  const first = await launchApp()
  try {
    const { page } = first
    await page.evaluate(() => {
      ;(window as unknown as { shown: number }).shown = 0
      window.stash.onPanelShown(() => {
        ;(window as unknown as { shown: number }).shown++
      })
      return window.stash.hideWindow()
    })

    const second = spawn(EXE, [], { env: appEnv(first.userData), stdio: 'ignore' })
    expect(await waitForExit(second)).toBe(0)

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { shown: number }).shown))
      .toBe(1)

    // Only one process may have started up.
    const log = readFileSync(join(first.userData, 'logs', 'main.log'), 'utf8')
    expect(log.match(/\[stash\] ready/g)).toHaveLength(1)
  } finally {
    await first.close()
    removeProfile(first.userData)
  }
})
