import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, removeProfile, showShelf, type LaunchedApp } from './app'

// Real Windows drag and drop: these move the mouse cursor, so they only run
// when asked for (STASH_REAL_INPUT=1) on a machine nobody is using.
test.skip(!process.env.STASH_REAL_INPUT, 'set STASH_REAL_INPUT=1 to run (moves the mouse)')

let stash: LaunchedApp
let work: string

test.beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), 'stash-real-'))
  stash = await launchApp()
  await stash.page.evaluate(() => window.stash.setSettings({ onboardingDone: true }))
  await stash.page.reload()
  await stash.page.locator('header').waitFor()
})
test.afterEach(async () => {
  await stash.close()
  removeProfile(stash.userData)
  rmSync(work, { recursive: true, force: true })
})

/** A point inside an element (or the window), in physical screen pixels. */
async function screenPoint(page: Page, selector?: string) {
  return page.evaluate((sel) => {
    const r = sel
      ? document.querySelector(sel)!.getBoundingClientRect()
      : { left: 0, top: 0, width: innerWidth, height: innerHeight }
    const x = screenX + r.left + r.width / 2
    const y = screenY + r.top + r.height / 2
    return { x: Math.round(x * devicePixelRatio), y: Math.round(y * devicePixelRatio) }
  }, selector)
}

const powershell = (script: string, args: string[]) =>
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(__dirname, 'helpers', script),
      ...args
    ],
    { encoding: 'utf8' }
  ).trim()

/** Drop a file from a helper window (retried once if the drag didn't start). */
function dropFile(path: string, to: { x: number; y: number }): string {
  let effect = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    effect = powershell('ole-drop.ps1', [
      '-File',
      path,
      '-ToX',
      String(to.x),
      '-ToY',
      String(to.y),
      '-TargetPid',
      String(stash.child.pid)
    ])
    if (effect === 'Copy') break
  }
  return effect
}

const shelfFiles = (page: Page, id: string | null) =>
  page.evaluate((s) => window.stash.listFiles(s).then((fs) => fs.map((f) => f.name).sort()), id)

/** The visible end of a shelf's tab (the drawer covers the rest when open). */
async function tabEnd(page: Page, shelfId: string) {
  return page.evaluate((id) => {
    const r = document.querySelector(`.tab[data-drop-shelf="${id}"]`)!.getBoundingClientRect()
    const x = screenX + Math.max(r.left, 0) + 16
    const y = screenY + r.top + r.height / 2
    return { x: Math.round(x * devicePixelRatio), y: Math.round(y * devicePixelRatio) }
  }, shelfId)
}

test('dropping into the drawer, on a tab, on a widget and on the tucked-in edge', async () => {
  const { page, browser } = stash
  const shelves = (await page.evaluate(() => window.stash.listShelves())).filter(
    (s) => s.kind !== 'pocket'
  )
  const [first, second, third] = shelves

  // 1. Into the open drawer: its shelf.
  await showShelf(page, first.name)
  // The helper's source window takes focus, and the drawer closes when it
  // loses focus unless it's kept open.
  await page.getByRole('button', { name: /^(Açık tut|Keep open)$/ }).click()
  const a = join(work, 'into-drawer.txt')
  writeFileSync(a, 'a')
  expect(dropFile(a, await screenPoint(page, '.drawer'))).toBe('Copy')
  await expect.poll(() => shelfFiles(page, first.id)).toEqual(['into-drawer.txt'])

  // 2. On another shelf's tab.
  const b = join(work, 'on-tab.txt')
  writeFileSync(b, 'b')
  expect(dropFile(b, await tabEnd(page, second.id))).toBe('Copy')
  await expect.poll(() => shelfFiles(page, second.id)).toEqual(['on-tab.txt'])

  // 3. On a desktop widget.
  await page.evaluate((id) => window.stash.openWidget(id), second.id)
  await expect
    .poll(() =>
      browser
        .contexts()[0]
        .pages()
        .some((p) => p.url().includes('view=widget'))
    )
    .toBe(true)
  const widget = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes('view=widget'))!
  await widget.waitForFunction(() => Boolean(window.stash))
  await page.evaluate(() => window.stash.hideWindow())
  const c = join(work, 'on-widget.txt')
  writeFileSync(c, 'c')
  const effect = dropFile(c, await screenPoint(widget))
  if (effect.startsWith('WrongTarget')) {
    // Widgets sit below other windows; another app may be covering it.
    test.info().annotations.push({ type: 'note', description: 'widget covered by another window' })
  } else {
    expect(effect).toBe('Copy')
    await expect.poll(() => shelfFiles(page, second.id)).toEqual(['on-tab.txt', 'on-widget.txt'])
  }

  // 4. On the tucked-in sliver: the tabs come out under the cursor.
  await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(20)
  const sliver = await page.evaluate((id) => {
    const r = document.querySelector(`.tab[data-drop-shelf="${id}"]`)!.getBoundingClientRect()
    return {
      x: Math.round((screenX + innerWidth - 4) * devicePixelRatio),
      y: Math.round((screenY + r.top + r.height / 2) * devicePixelRatio)
    }
  }, third.id)
  const d = join(work, 'on-edge.txt')
  writeFileSync(d, 'd')
  expect(dropFile(d, sliver)).toBe('Copy')
  await expect.poll(() => shelfFiles(page, third.id)).toEqual(['on-edge.txt'])
  // …and tuck back in.
  await expect.poll(() => page.evaluate(() => innerWidth), { timeout: 5000 }).toBeLessThan(20)
})

test('dragging a card onto another shelf tab moves it', async () => {
  const { page } = stash
  const [first, second] = (await page.evaluate(() => window.stash.listShelves())).filter(
    (s) => s.kind !== 'pocket'
  )
  const p = join(work, 'move me.txt')
  writeFileSync(p, 'x')
  await page.evaluate(([path, id]) => window.stash.addFiles([path], id), [p, first.id])
  await page.reload()
  await showShelf(page, first.name)
  await page.getByRole('option', { name: 'move me.txt' }).waitFor()

  const from = await screenPoint(page, '[data-file-id]')
  const to = await tabEnd(page, second.id)
  expect(
    powershell('mouse-drag.ps1', [
      '-FromX',
      String(from.x),
      '-FromY',
      String(from.y),
      '-ToX',
      String(to.x),
      '-ToY',
      String(to.y),
      '-TargetPid',
      String(stash.child.pid)
    ])
  ).toBe('Done')
  await expect.poll(() => shelfFiles(page, second.id)).toEqual(['move me.txt'])
  expect(await shelfFiles(page, first.id)).toEqual([])
})
