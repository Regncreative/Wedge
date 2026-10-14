import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, removeProfile, type LaunchedApp } from './app'

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

test('dropping on the panel, a rail shelf, a widget and the edge handle', async () => {
  const { page, browser } = stash
  const shelves = await page.evaluate(() => window.stash.listShelves())
  const [first, second] = shelves

  // 1. Onto the panel: the shelf on screen.
  await page
    .getByRole('button', { name: new RegExp(first.name) })
    .first()
    .click()
  const a = join(work, 'onto-panel.txt')
  writeFileSync(a, 'a')
  expect(dropFile(a, await screenPoint(page, 'main'))).toBe('Copy')
  await expect.poll(() => shelfFiles(page, first.id)).toEqual(['onto-panel.txt'])

  // 2. Onto another shelf in the rail.
  const b = join(work, 'onto-rail.txt')
  writeFileSync(b, 'b')
  expect(dropFile(b, await screenPoint(page, `[data-drop-shelf="${second.id}"]`))).toBe('Copy')
  await expect.poll(() => shelfFiles(page, second.id)).toEqual(['onto-rail.txt'])

  // 3. Onto a desktop widget.
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
  const c = join(work, 'onto-widget.txt')
  writeFileSync(c, 'c')
  const effect = dropFile(c, await screenPoint(widget))
  if (effect.startsWith('WrongTarget')) {
    // Widgets sit below other windows; another app may be covering it.
    test.info().annotations.push({ type: 'note', description: 'widget covered by another window' })
  } else {
    expect(effect).toBe('Copy')
    await expect
      .poll(() => shelfFiles(page, second.id))
      .toEqual(['onto-rail.txt', 'onto-widget.txt'])
  }

  // 4. Onto the edge handle (shown while the panel is closed): the default shelf.
  const edge = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes('view=edge'))!
  const settings = await page.evaluate(() => window.stash.getSettings())
  const at = await edge.evaluate(() => ({
    x: Math.round((screenX + innerWidth - 4) * devicePixelRatio),
    y: Math.round((screenY + innerHeight / 2) * devicePixelRatio)
  }))
  const d = join(work, 'onto-edge.txt')
  writeFileSync(d, 'd')
  expect(dropFile(d, at)).toBe('Copy')
  await expect.poll(() => shelfFiles(page, settings.defaultShelfId)).toContain('onto-edge.txt')
})

test('dragging a file onto a shelf in the rail moves it', async () => {
  const { page } = stash
  const [first, second] = await page.evaluate(() => window.stash.listShelves())
  const p = join(work, 'move me.txt')
  writeFileSync(p, 'x')
  await page.evaluate(([path, id]) => window.stash.addFiles([path], id), [p, first.id])
  await page.reload()
  await page
    .getByRole('button', { name: new RegExp(first.name) })
    .first()
    .click()
  await page.getByRole('option', { name: 'move me.txt' }).waitFor()

  const from = await screenPoint(page, '[data-file-id]')
  const to = await screenPoint(page, `[data-drop-shelf="${second.id}"]`)
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
