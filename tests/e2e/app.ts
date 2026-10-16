import { chromium, type Browser, type Page } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/** Built by `npm run build:e2e` (tauri build --debug --no-bundle). */
export const EXE =
  process.env.STASH_EXE ?? resolve(__dirname, '../../src-tauri/target/debug/wedge.exe')

export interface LaunchedApp {
  child: ChildProcess
  browser: Browser
  page: Page
  userData: string
  /** Stand-ins for the watched Downloads and Screenshots folders. */
  downloads: string
  screenshots: string
  /** Where files removed from shared shelves go (instead of the Recycle Bin). */
  trash: string
  close: () => Promise<void>
}

let nextPort = 9300 + Math.floor(Math.random() * 500)

/**
 * Where WebView2 notes the DevTools port it listens on. An elevated app (as on
 * CI runners) ignores WEBVIEW2_* variables; there a machine-wide policy passes
 * `--remote-debugging-port=0` instead (see ci.yml), and this file has the port.
 */
const DEVTOOLS_ACTIVE_PORT = join(
  process.env.LOCALAPPDATA ?? tmpdir(),
  'com.regncreative.wedge',
  'EBWebView',
  'DevToolsActivePort'
)

function devtoolsPort(requested: number): number {
  try {
    const port = Number(readFileSync(DEVTOOLS_ACTIVE_PORT, 'utf8').split('\n')[0])
    return port > 0 ? port : requested
  } catch {
    return requested
  }
}

export function appEnv(userData: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    STASH_USER_DATA: userData,
    STASH_SHOW_ON_START: '1',
    // Never watch the real Downloads/Screenshots or open a LAN port in tests.
    STASH_DOWNLOADS_DIR: join(userData, 'test-downloads'),
    STASH_SCREENSHOTS_DIR: join(userData, 'test-screenshots'),
    STASH_PHONE_LOOPBACK: '1',
    // Shared-shelf removals go here instead of the real Recycle Bin.
    STASH_TRASH_DIR: join(userData, 'test-trash'),
    ...extra
  }
}

/** The app's child processes (WebView2), their command lines and listening ports. */
export function webviewProcesses(pid: number | undefined): string {
  if (!pid) return '(no pid)'
  const script = `
    $all = Get-CimInstance Win32_Process
    $ids = @{ ${pid} = $true }
    do { $more = $false
      foreach ($p in $all) { if ($ids.ContainsKey([int]$p.ParentProcessId) -and -not $ids.ContainsKey([int]$p.ProcessId)) { $ids[[int]$p.ProcessId] = $true; $more = $true } }
    } while ($more)
    foreach ($p in $all | Where-Object { $ids.ContainsKey([int]$_.ProcessId) -and $_.ProcessId -ne ${pid} }) {
      $cmd = "$($p.CommandLine)"
      $ports = (Get-NetTCPConnection -OwningProcess $p.ProcessId -State Listen -ErrorAction SilentlyContinue | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ' '
      $debug = ([regex]::Matches($cmd, '--remote-debugging-[a-z]+(=[^ ]*)?') | ForEach-Object { $_.Value }) -join ' '
      "$($p.ProcessId) $($p.Name) listen=[$ports] debug=[$debug] $($cmd.Substring(0, [Math]::Min(160, $cmd.Length)))"
    }`
  try {
    return (
      execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        timeout: 20_000
      }).trim() || '(none)'
    )
  } catch (err) {
    return `(could not list: ${String(err).split('\n')[0]})`
  }
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
  userData = mkdtempSync(join(tmpdir(), 'stash-e2e-')),
  env: Record<string, string> = {}
): Promise<LaunchedApp> {
  const port = nextPort++
  const downloads = join(userData, 'test-downloads')
  const screenshots = join(userData, 'test-screenshots')
  mkdirSync(downloads, { recursive: true })
  mkdirSync(screenshots, { recursive: true })
  rmSync(DEVTOOLS_ACTIVE_PORT, { force: true })
  const child = spawn(EXE, [], {
    env: appEnv(userData, {
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      ...env
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  })
  // The app's own output (debug builds log to it), kept to explain a failed start.
  let output = ''
  const keep = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-6000)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  const failedStart = (why: string) => {
    const log = join(userData, 'logs', 'main.log')
    const logText = existsSync(log) ? readFileSync(log, 'utf8').slice(-4000) : '(no main.log)'
    return new Error(
      [
        why,
        '--- app output ---',
        output,
        '--- main.log ---',
        logText,
        '--- WebView2 processes and their ports ---',
        webviewProcesses(child.pid)
      ].join('\n')
    )
  }

  let browser: Browser | null = null
  const deadline = Date.now() + 30_000
  while (!browser) {
    if (child.exitCode !== null) throw failedStart(`wedge.exe exited with ${child.exitCode}`)
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${devtoolsPort(port)}`)
    } catch (err) {
      if (Date.now() > deadline) {
        const error = failedStart(
          `no DevTools endpoint on port ${devtoolsPort(port)}: ${String(err).split('\n')[0]}`
        )
        child.kill()
        throw error
      }
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
    downloads,
    screenshots,
    trash: join(userData, 'test-trash'),
    close: async () => {
      await browser?.close().catch(() => {})
      child.kill()
      await waitForExit(child)
    }
  }
}

/**
 * A shelf's tab on the screen edge. With the drawer open only its outer end
 * shows (the drawer covers the rest), so clicks go near that end.
 */
export function tab(page: Page, shelfName: string) {
  return page.getByRole('button', { name: new RegExp(`^${shelfName}, `) })
}
export const TAB_END = { position: { x: 22, y: 26 } }

/** Open a shelf in the drawer (a click on its tab toggles, so only if it isn't showing). */
export async function showShelf(page: Page, shelfName: string): Promise<void> {
  const title = await page
    .locator('.drawer header h1')
    .textContent()
    .catch(() => null)
  const open = await page.evaluate(async () => (await window.stash.edgeState()).mode === 'open')
  if (open && title === shelfName) return
  await tab(page, shelfName).click(TAB_END)
  await page.locator('.drawer header h1', { hasText: shelfName }).waitFor()
}

/** Where the edge window catches the cursor: physical screen pixels. */
export async function edgeArea(page: Page) {
  const area = await page.evaluate(() => window.stash.edgeArea())
  const [x, y, width, height] = area!
  return { x, y, width, height }
}

/** The window a click at each point would reach: its process and style bits (reads only). */
export function windowsAt(points: { x: number; y: number }[]): { pid: number; style: number }[] {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(__dirname, 'helpers', 'window-at.ps1'),
      '-Points',
      points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';')
    ],
    { encoding: 'utf8' }
  )
  return out
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [pid, style] = line.trim().split(' ').map(Number)
      return { pid, style }
    })
}

/** The process whose window a click at each point would reach (reads only). */
export function pidsAt(points: { x: number; y: number }[]): number[] {
  return windowsAt(points).map((w) => w.pid)
}

export function removeProfile(userData: string): void {
  rmSync(userData, { recursive: true, force: true })
}

export { waitForExit }
