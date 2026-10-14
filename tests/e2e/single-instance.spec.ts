import { expect, test } from '@playwright/test'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { launchApp, removeProfile } from './app'

test('a second launch exits at once and opens the running panel', async () => {
  const first = await launchApp()
  try {
    await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide())

    // Plain spawn (not Playwright) so this is an ordinary second launch.
    const electronPath = (await import('electron')).default as unknown as string
    const second = spawn(electronPath, ['.'], {
      env: { ...process.env, STASH_USER_DATA: first.userData },
      stdio: 'ignore'
    })
    const exitCode = await new Promise<number | null>((resolve) => second.on('exit', resolve))
    expect(exitCode).toBe(0)

    await expect
      .poll(() =>
        first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())
      )
      .toBe(true)

    // Had the second process started up, it would have tried (and failed) to
    // grab the global hotkey the first one holds.
    const log = readFileSync(join(first.userData, 'logs', 'main.log'), 'utf8')
    expect(log).not.toContain('Failed to register hotkey')
  } finally {
    await first.close()
    removeProfile(first.userData)
  }
})
