import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  userData: string
  close: () => Promise<void>
}

/**
 * Start the built app with a throwaway profile and show the panel
 * (it normally starts hidden in the tray).
 */
export async function launchApp(userData = mkdtempSync(join(tmpdir(), 'stash-e2e-'))): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, STASH_USER_DATA: userData, NODE_ENV: 'test' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
  return {
    app,
    page,
    userData,
    close: async () => {
      await app.close()
    }
  }
}

export function removeProfile(userData: string): void {
  rmSync(userData, { recursive: true, force: true })
}
