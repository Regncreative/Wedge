import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, removeProfile, showShelf, tab, type LaunchedApp } from './app'

/*
 * Performance: start-up, idle cost, how fast the edge reacts, animation
 * frames, and a shelf with a thousand files. Opt-in (`npm run test:perf`): the
 * numbers depend on the machine, and the e2e build is a debug build (the
 * Rust side is slower than a release). Budgets are generous; the printed
 * numbers are the point.
 */
test.skip(
  !process.env.STASH_PERF && process.env.npm_lifecycle_event !== 'test:perf',
  'run `npm run test:perf` (or set STASH_PERF=1) to measure performance'
)
test.describe.configure({ mode: 'serial' })

const results: Record<string, string | number> = {}
const note = (key: string, value: string | number) => {
  results[key] = value
  test.info().annotations.push({ type: key, description: String(value) })
}

let stash: LaunchedApp
let work: string
test.beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'stash-perf-'))
})
test.afterAll(async () => {
  await stash?.close()
  if (stash) removeProfile(stash.userData)
  rmSync(work, { recursive: true, force: true })
  console.log('\nPerformance\n' + JSON.stringify(results, null, 2))
})

interface Usage {
  each: { pid: number; name: string; privateMB: number }[]
  processes: number
  workingSetMB: number
  privateMB: number
  mainPrivateMB: number
  cpuMs: number
}
/** Memory and CPU time of the app and its WebView2 processes. */
function usage(pid: number): Usage {
  return JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(__dirname, 'helpers', 'proc-usage.ps1'),
        '-RootPid',
        String(pid)
      ],
      { encoding: 'utf8' }
    )
  ) as Usage
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const round = (n: number) => Math.round(n * 10) / 10

interface Frames {
  frames: number
  avg: number
  max: number
  /** Frames that took over 50 ms: a visible hitch (two frames lost at 60 Hz,
      one at 30 Hz as over Remote Desktop). */
  long: number
}
/** Animation frames while `act` runs and for `ms` after. */
async function frames(page: Page, act: () => Promise<unknown>, ms = 700): Promise<Frames> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rec: boolean }
    w.__frames = []
    w.__rec = true
    const loop = (t: number) => {
      w.__frames.push(t)
      if (w.__rec) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  })
  await act()
  await page.waitForTimeout(ms)
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __rec: boolean }
    w.__rec = false
    const f = w.__frames
    const gaps = f.slice(1).map((t, i) => t - f[i])
    const sum = gaps.reduce((a, b) => a + b, 0)
    return {
      frames: f.length,
      avg: gaps.length ? sum / gaps.length : 0,
      max: gaps.length ? Math.max(...gaps) : 0,
      long: gaps.filter((g) => g > 50).length
    }
  })
}

/** Whether the page is being drawn at all (a locked or minimized session isn't). */
async function rendering(page: Page): Promise<boolean> {
  const f = await frames(page, async () => {}, 300)
  return f.frames > 5
}

test('starts quickly and costs nothing while idle', async () => {
  const t0 = Date.now()
  stash = await launchApp()
  note('startup to UI ready (ms)', Date.now() - t0)
  const { page } = stash
  note(
    'page load (ms)',
    await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      return Math.round(nav.loadEventEnd)
    })
  )
  await page.evaluate(() => window.stash.setSettings({ onboardingDone: true }))
  await page.evaluate(() => window.stash.edgeMode('idle'))
  // Let start-up work (compiling, the first paint, the index) finish.
  await page.waitForTimeout(15_000)

  const pid = stash.child.pid!
  const before = usage(pid)
  const seconds = 10
  await page.waitForTimeout(seconds * 1000)
  const after = usage(pid)
  const cpu = ((after.cpuMs - before.cpuMs) / (seconds * 1000)) * 100
  note('idle CPU (% of one core)', round(cpu))
  note('processes', after.processes)
  note('private memory, all processes (MB)', after.privateMB)
  note('private memory, Wedge itself (MB)', after.mainPrivateMB)
  note(
    '…by process, at rest (MB)',
    after.each
      .map((p) => `${p.name.replace('.exe', '')} ${p.privateMB}`)
      .sort()
      .join(', ')
  )
  note('working set, all processes (MB)', after.workingSetMB)

  expect(cpu).toBeLessThan(2)
  expect(after.privateMB).toBeLessThan(400)
})

test('the edge reacts at once', async () => {
  const { page } = stash
  const timings = await page.evaluate(async () => {
    const state: number[] = []
    const mode: number[] = []
    for (let i = 0; i < 40; i++) {
      let t = performance.now()
      await window.stash.edgeState()
      state.push(performance.now() - t)
      t = performance.now()
      await window.stash.edgeMode(i % 2 ? 'idle' : 'peek')
      mode.push(performance.now() - t)
    }
    return { state, mode }
  })
  note(
    'IPC round trip p50 / p95 (ms)',
    `${round(percentile(timings.state, 50))} / ${round(percentile(timings.state, 95))}`
  )
  note(
    'mode switch p50 / p95 (ms)',
    `${round(percentile(timings.mode, 50))} / ${round(percentile(timings.mode, 95))}`
  )
  expect(percentile(timings.state, 95)).toBeLessThan(25)
  expect(percentile(timings.mode, 95)).toBeLessThan(40)
})

test('tabs and drawer animate without hitches', async () => {
  const { page } = stash
  await page.evaluate(() => window.stash.edgeMode('idle'))
  await page.waitForTimeout(600)
  if (!(await rendering(page))) {
    note('animation', 'not measured: the screen is off (locked or minimized session)')
    return
  }
  const shelf = (await page.evaluate(() => window.stash.listShelves())).find(
    (s) => s.kind !== 'pocket'
  )!
  const runs: Record<string, Frames> = {
    'tabs out': await frames(page, () => page.evaluate(() => window.stash.edgeMode('peek'))),
    'tabs in': await frames(page, () => page.evaluate(() => window.stash.edgeMode('idle'))),
    'drawer opens': await frames(page, () => tab(page, shelf.name).click()),
    'drawer closes': await frames(page, () => page.evaluate(() => window.stash.edgeMode('idle')))
  }
  for (const [name, f] of Object.entries(runs)) {
    note(
      `${name}: fps / slowest frame (ms) / hitches`,
      `${Math.round(1000 / f.avg)} / ${Math.round(f.max)} / ${f.long}`
    )
    expect(f.long, name).toBeLessThanOrEqual(3)
  }
})

test('a shelf with a thousand files stays quick', async () => {
  const { page } = stash
  const shelf = (await page.evaluate(() => window.stash.listShelves())).find(
    (s) => s.kind !== 'pocket'
  )!
  const paths: string[] = []
  for (let i = 0; i < 1000; i++) {
    const p = join(work, `report-${String(i).padStart(4, '0')}.txt`)
    writeFileSync(p, `report ${i}`)
    paths.push(p)
  }
  const images = ['Windows/img0.jpg', 'Windows/img19.jpg', 'ThemeA/img20.jpg', 'ThemeB/img24.jpg']
  for (let i = 0; i < 40; i++) {
    const p = join(work, `photo-${i}.jpg`)
    copyFileSync(join('C:/Windows/Web/Wallpaper', images[i % images.length]), p)
    paths.push(p)
  }

  // Dropped into the open drawer, the way a drop from Explorer arrives
  // (src-tauri/src/dragdrop.rs): saved, then the tabs and cards update.
  await page.evaluate(() => window.stash.edgeMode('open'))
  await showShelf(page, shelf.name)
  let t = Date.now()
  await page.evaluate((ps) => {
    const tauri = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<unknown> }
      }
    ).__TAURI_INTERNALS__
    return tauri.invoke('plugin:event|emit', {
      event: 'stash-drop-paths',
      payload: {
        info: { window: 'panel', id: 1, x: innerWidth / 2, y: innerHeight / 2 },
        paths: ps
      }
    })
  }, paths)
  await expect(tab(page, shelf.name).locator('.tab-count')).toHaveText('1040', { timeout: 20_000 })
  note('drop 1040 files, until the tab counts them (ms)', Date.now() - t)
  await expect(page.getByRole('option').first()).toBeVisible()
  note('…until the cards show (ms)', Date.now() - t)

  // Switching to the full shelf from another one, sorted by name: from the
  // click until its cards are painted.
  await page.evaluate(() => window.stash.setSettings({ fileSort: 'name' }))
  const other = (await page.evaluate(() => window.stash.listShelves())).find(
    (s) => s.kind !== 'pocket' && s.id !== shelf.id
  )!
  await showShelf(page, other.name)
  await page.waitForTimeout(600)
  const switchMs = await page.evaluate(async (name) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab')).find((b) =>
      b.getAttribute('aria-label')?.startsWith(`${name}, `)
    )!
    const t = performance.now()
    button.click()
    await new Promise<void>((done) => {
      const check = () => {
        const title = document.querySelector('.drawer header h1')?.textContent
        if (title === name && document.querySelector('[role="option"]')) done()
        else requestAnimationFrame(check)
      }
      check()
    })
    // …and painted.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r)))
    return Math.round(performance.now() - t)
  }, shelf.name)
  note('switch to the 1040-file shelf (ms)', switchMs)
  expect(switchMs).toBeLessThan(300)
  const cards = await page.getByRole('option').count()
  note('cards in the page (virtualized)', cards)
  expect(cards).toBeLessThan(80)

  note(
    'list all files over IPC (ms)',
    await page.evaluate(async () => {
      const t = performance.now()
      await window.stash.listFiles(null)
      return Math.round(performance.now() - t)
    })
  )

  t = Date.now()
  await page
    .getByRole('searchbox')
    .or(page.locator('.drawer header input'))
    .first()
    .fill('report-099')
  await expect(page.getByRole('option')).toHaveCount(10)
  note('search 1040 files (ms)', Date.now() - t)
  await page.locator('.drawer header input').first().fill('')
  await expect(page.getByRole('option').first()).toBeVisible()

  if (await rendering(page)) {
    const scroll = await frames(
      page,
      () =>
        page.evaluate(
          () =>
            new Promise<void>((done) => {
              const list = document.querySelector<HTMLElement>('[role="listbox"]')!
              const step = () => {
                list.scrollTop += 160
                if (list.scrollTop + list.clientHeight >= list.scrollHeight - 2) done()
                else requestAnimationFrame(step)
              }
              requestAnimationFrame(step)
            })
        ),
      100
    )
    note(
      'scroll 1040 files: fps / slowest frame (ms) / hitches',
      `${Math.round(1000 / scroll.avg)} / ${Math.round(scroll.max)} / ${scroll.long}`
    )
    expect(scroll.long).toBeLessThanOrEqual(2)
  } else {
    note('scroll', 'not measured: the screen is off (locked or minimized session)')
  }

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('HeapProfiler.collectGarbage')
  const heap = await cdp.send('Runtime.getHeapUsage')
  note('page JavaScript memory with 1040 files, after GC (MB)', round(heap.usedSize / 1048576))
  expect(heap.usedSize).toBeLessThan(60 * 1048576)

  const after = usage(stash.child.pid!)
  note('private memory with 1040 files (MB)', after.privateMB)
  note(
    '…by process, with 1040 files (MB)',
    after.each
      .map((p) => `${p.name.replace('.exe', '')} ${p.privateMB}`)
      .sort()
      .join(', ')
  )
  expect(after.privateMB).toBeLessThan(500)
})
