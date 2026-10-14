import { chromium, type Browser, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/** Built by `npm run build:e2e` (tauri build --debug --no-bundle). */
export const EXE =
  process.env.STASH_EXE ?? resolve(__dirname, '../../src-tauri/target/debug/stash.exe')

export interface LaunchedApp {
  child: ChildProcess
  browser: Browser
  page: Page
  userData: string
  close: () => Promise<void>
}

let nextPort = 9300 + Math.floor(Math.random() * 500)

export function appEnv(userData: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, STASH_USER_DATA: userData, STASH_SHOW_ON_START: '1', ...extra }
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  return new Promise((r) => child.once('exit', (code) => r(code)))
}

/**
 * Start the real app on a throwaway profile with the panel shown, and attach
 * Playwright to its WebView2 through the Chrome DevTools Protocol.
 */
export async function launchApp(
  userData = mkdtempSync(join(tmpdir(), 'stash-e2e-'))
): Promise<LaunchedApp> {
  const port = nextPort++
  const child = spawn(EXE, [], {
    env: appEnv(userData, {
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`
    }),
    stdio: 'ignore'
  })

  let browser: Browser | null = null
  const deadline = Date.now() + 30_000
  while (!browser) {
    if (child.exitCode !== null) throw new Error(`stash.exe exited with ${child.exitCode}`)
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    } catch (err) {
      if (Date.now() > deadline) throw err
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  const context = browser.contexts()[0]
  const page = context.pages()[0] ?? (await context.waitForEvent('page'))
  await page.waitForFunction(() => Boolean(window.stash), null, { timeout: 20_000 })
  await page.locator('header').waitFor()

  return {
    child,
    browser,
    page,
    userData,
    close: async () => {
      await browser?.close().catch(() => {})
      child.kill()
      await waitForExit(child)
    }
  }
}

export function removeProfile(userData: string): void {
  rmSync(userData, { recursive: true, force: true })
}

export { waitForExit }
