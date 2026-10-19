import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { edgeArea, launchApp, pidsAt, removeProfile, tab, type LaunchedApp } from './app'

let workDir: string
let stash: LaunchedApp

async function seed(page: Page, names: string[]): Promise<void> {
  const paths = names.map((n) => {
    const p = join(workDir, n)
    writeFileSync(p, n)
    return p
  })
  await page.evaluate((ps) => window.stash.addFiles(ps), paths)
  await page.evaluate(() => window.stash.setSettings({ onboardingDone: true, fileSort: 'name' }))
  await page.reload()
}

const row = (page: Page, name: string) => page.getByRole('option', { name })

test.beforeEach(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'stash-files-'))
  stash = await launchApp()
})
test.afterEach(async () => {
  await stash.close()
  removeProfile(stash.userData)
  rmSync(workDir, { recursive: true, force: true })
})

test('shows the welcome screen once on a fresh install', async () => {
  const { page } = stash
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button').click()
  await expect(dialog).toBeHidden()

  await page.reload()
  await expect(page.locator('header')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
  expect((await page.evaluate(() => window.stash.getSettings())).onboardingDone).toBe(true)
})

test('selects with Ctrl/Shift+click and removes the selection', async () => {
  const { page } = stash
  await seed(page, ['a.txt', 'b.txt', 'c.txt', 'd.txt'])

  await row(page, 'a.txt').click()
  await row(page, 'c.txt').click({ modifiers: ['Shift'] })
  await expect(page.getByRole('option', { selected: true })).toHaveCount(3)

  await row(page, 'b.txt').click({ modifiers: ['Control'] })
  await expect(page.getByRole('option', { selected: true })).toHaveCount(2)

  const bar = page.getByRole('toolbar')
  await expect(bar).toBeVisible()
  await bar.getByRole('button', { name: /^(Kaldır|Remove)$/ }).click()
  await page.getByRole('dialog').getByRole('button').last().click() // confirm

  await expect(page.getByRole('option')).toHaveCount(2)
  await expect(row(page, 'b.txt')).toBeVisible()
  await expect(row(page, 'd.txt')).toBeVisible()
})

test('navigates and acts with the keyboard', async () => {
  const { page } = stash
  await seed(page, ['a.txt', 'b.txt', 'c.txt'])

  // Cards sit in a grid: left/right step one, up/down a row.
  await row(page, 'a.txt').focus()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'b.txt')).toBeFocused()
  await expect(row(page, 'b.txt')).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.getByRole('option', { selected: true })).toHaveCount(2)

  await page.keyboard.press('Control+a')
  await expect(page.getByRole('option', { selected: true })).toHaveCount(3)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('option', { selected: true })).toHaveCount(0)

  await page.keyboard.press('End')
  await expect(row(page, 'c.txt')).toBeFocused()
  await page.keyboard.press('p')
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.stash.listFiles(null)))
        .filter((f) => f.isPinned)
        .map((f) => f.name)
    )
    .toEqual(['c.txt'])

  await page.keyboard.press('Delete')
  await page.getByRole('dialog').getByRole('button').last().click()
  await expect(page.getByRole('option')).toHaveCount(2)
})

test('keeps every tab on screen when there are more shelves than room', async () => {
  const { page } = stash
  await page.evaluate(() => window.stash.setSettings({ onboardingDone: true }))
  // More than any screen has room for at full size.
  for (let i = 1; i <= 24; i++) {
    await page.evaluate((name) => window.stash.createShelf({ name }), `Shelf ${i}`)
  }
  await page.reload()
  const shelves = await page.evaluate(async () => (await window.stash.listShelves()).length)
  await expect(page.locator('.tab')).toHaveCount(shelves)
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.tab')).every((el) => {
          const r = el.getBoundingClientRect()
          return r.top >= 0 && r.bottom <= window.innerHeight
        })
      )
    )
    .toBe(true)
  // With the drawer open, every tab hangs off its left side: the drawer grows
  // to the tabs, none float above or below it.
  await page.evaluate(() => window.stash.edgeMode('open'))
  await expect
    .poll(() =>
      page.evaluate(() => {
        const drawer = document.querySelector('.drawer')!.getBoundingClientRect()
        return Array.from(document.querySelectorAll('.tab')).every((el) => {
          const r = el.getBoundingClientRect()
          return r.left < drawer.left && r.top >= drawer.top - 1 && r.bottom <= drawer.bottom + 1
        })
      })
    )
    .toBe(true)
})

test('puts the tabs at the top, middle or bottom of the edge, on a display that exists', async () => {
  const { page } = stash
  await page.evaluate(() => window.stash.setSettings({ onboardingDone: true }))
  await page.reload()
  const top = async (edgeAlign: 'top' | 'center' | 'bottom') => {
    await page.evaluate((a) => window.stash.setSettings({ edgeAlign: a }), edgeAlign)
    return (await page.evaluate(() => window.stash.edgeArea()))![1]
  }
  const [high, middle, low] = [await top('top'), await top('center'), await top('bottom')]
  expect(high).toBeLessThan(middle)
  expect(middle).toBeLessThan(low)

  // At the top, the first tab lines up with the open drawer's top. (The page
  // reads the setting from its store, which Settings keeps up to date.)
  await page.evaluate(() => window.stash.setSettings({ edgeAlign: 'top' }))
  await page.reload()
  await page.evaluate(() => window.stash.edgeMode('open'))
  await expect
    .poll(() =>
      page.evaluate(() => {
        const drawer = document.querySelector('.drawer')!.getBoundingClientRect()
        const first = document.querySelector('.tab')!.getBoundingClientRect()
        return Math.abs(first.top - drawer.top) <= 1
      })
    )
    .toBe(true)
  await page.evaluate(() => window.stash.edgeMode('idle'))

  // A display that isn't there (unplugged) leaves the tabs on the main one.
  const monitors = await page.evaluate(() => window.stash.listMonitors())
  expect(monitors.some((m) => m.primary)).toBe(true)
  await page.evaluate(() => window.stash.setSettings({ edgeMonitor: '\\.\DISPLAY99' }))
  const [x, y] = (await page.evaluate(() => window.stash.edgeArea()))!
  expect(x).toBeGreaterThan(-30000)
  expect(y).toBeGreaterThan(-30000)
  // The display with the mouse: wherever the cursor is, on screen.
  await page.evaluate(() => window.stash.setSettings({ edgeMonitor: 'cursor' }))
  expect((await page.evaluate(() => window.stash.edgeArea()))![0]).toBeGreaterThan(-30000)
})

test('hides the tabs away entirely when asked, and they still come out', async () => {
  const { page } = stash
  await page.evaluate(() =>
    window.stash.setSettings({ onboardingDone: true, edgeMonitor: 'primary', edgeHandle: 'right' })
  )
  await page.reload()
  await page.locator('.tabs').waitFor()
  const width = async () => (await page.evaluate(() => window.stash.edgeArea()))![2]
  // Where the window's right edge (the screen's) cuts the leftmost tab.
  const showing = () =>
    page.evaluate(() =>
      Math.max(
        ...Array.from(
          document.querySelectorAll('.tab'),
          (t) => innerWidth - t.getBoundingClientRect().left
        )
      )
    )
  // Tucked in, with the cursor away from the panel.
  const tuckIn = async () => {
    await page.mouse.move(-20, -20)
    await page.evaluate(() => window.stash.edgeMode('idle'))
    await expect
      .poll(() => page.evaluate(async () => (await window.stash.edgeState()).mode))
      .toBe('idle')
  }
  await tuckIn()
  await expect.poll(showing).toBeGreaterThan(4)
  await expect.poll(showing).toBeLessThan(20)
  const sliver = await width()

  await page.evaluate(() => window.stash.setSettings({ edgeAutoHide: true }))
  await page.reload()
  await page.locator('.tabs').waitFor()
  await tuckIn()
  // Nothing of the tabs on screen, and only the edge itself takes the cursor.
  await expect.poll(showing).toBeLessThanOrEqual(0)
  expect(await width()).toBeLessThan(sliver)
  expect(await width()).toBeGreaterThan(0)
  // Windows sends the cursor at the very edge to Wedge, though nothing shows
  // there; a few pixels in, it goes to whatever is below.
  const strip = await edgeArea(page)
  const mid = strip.y + strip.height / 2
  const [onEdge, inside] = pidsAt([
    { x: strip.x + strip.width - 1, y: mid },
    { x: strip.x - 6, y: mid }
  ])
  expect(onEdge).toBe(stash.child.pid)
  expect(inside).not.toBe(stash.child.pid)

  // The cursor at the edge still brings them out.
  const box = (await page.locator('.tabs').boundingBox())!
  const edge = await page.evaluate(() => innerWidth - 1)
  await page.mouse.move(edge, box.y + box.height / 2)
  await expect
    .poll(() => page.evaluate(async () => (await window.stash.edgeState()).mode))
    .toBe('peek')
  await expect.poll(showing).toBeGreaterThan(100)

  await page.evaluate(() => window.stash.setSettings({ edgeAutoHide: false }))
  await page.reload()
  await tuckIn()
})

test('puts a second line on a tab only where it says something, and can drop it', async () => {
  const { page } = stash
  await page.locator('.tabs').waitFor()
  const shelves = await page.evaluate(() => window.stash.listShelves())
  const by = (f: (s: (typeof shelves)[number]) => boolean) => shelves.find(f)!
  const work = by((s) => s.icon === 'briefcase').name
  const pocket = by((s) => s.kind === 'pocket').name
  // A new install's Temporary shelf keeps files until it's given a time.
  const clock = by((s) => s.icon === 'clock')
  const temp = clock.name
  await expect(tab(page, temp).locator('.tab-sub')).toHaveCount(0)
  await page.evaluate((id) => window.stash.setShelfExpiry(id, 168), clock.id)
  await page.reload()
  await page.locator('.tabs').waitFor()
  const sub = (name: string) => tab(page, name).locator('.tab-sub')
  // A plain shelf just keeps files: nothing to say under its name.
  await expect(sub(work)).toHaveCount(0)
  // (In the language Windows uses: "KEEPS 7 DAYS", "7 GÜN KALIR".)
  await expect(sub(temp)).toHaveText(/7/)
  await expect(sub(pocket)).toHaveCount(1)

  await page.evaluate(() => window.stash.setSettings({ edgeTabDetails: false }))
  await page.reload()
  await page.locator('.tabs').waitFor()
  await expect(page.locator('.tab .tab-sub')).toHaveCount(0)
  await expect(page.locator('.tab .tab-name')).toHaveCount(shelves.length)

  await page.evaluate(() => window.stash.setSettings({ edgeTabDetails: true }))
  await page.evaluate((id) => window.stash.setShelfExpiry(id, null), clock.id)
  await page.reload()
  await expect(sub(pocket)).toHaveCount(1)
})

test('takes a link or text dragged from another app onto a tab', async () => {
  const { page } = stash
  await page.evaluate(() => window.stash.setSettings({ onboardingDone: true }))
  await page.reload()
  await page.locator('.tabs').waitFor()
  const shelves = await page.evaluate(() => window.stash.listShelves())
  const work = shelves.find((s) => s.icon === 'briefcase')!
  const names = () =>
    page.evaluate((id) => window.stash.listFiles(id).then((f) => f.map((x) => x.name)), work.id)
  // What a browser or an editor hands over in a drag, dropped on the tab.
  const drop = async (data: Record<string, string>) => {
    await page.evaluate(() => window.stash.edgeMode('drag'))
    const box = (await tab(page, work.name).boundingBox())!
    await page.evaluate(
      ({ data, x, y }) => {
        const transfer = new DataTransfer()
        for (const [format, value] of Object.entries(data)) transfer.setData(format, value)
        const at = document.elementFromPoint(x, y)!
        for (const type of ['dragenter', 'dragover', 'drop']) {
          at.dispatchEvent(
            new DragEvent(type, {
              dataTransfer: transfer,
              clientX: x,
              clientY: y,
              bubbles: true,
              cancelable: true
            })
          )
        }
      },
      { data, x: box.x + box.width / 2, y: box.y + box.height / 2 }
    )
  }

  const url = 'https://example.com/notes'
  await drop({
    'text/uri-list': url,
    'text/plain': url,
    'text/html': `<a href="${url}">Meeting notes</a>`
  })
  await expect.poll(names).toContain('Meeting notes.url')
  await drop({ 'text/plain': 'Call Ada\nabout the invoice' })
  await expect.poll(names).toContain('Call Ada.txt')

  // Saved like Ctrl+V saves them: a shortcut to the page, and the whole text.
  const files = await page.evaluate((id) => window.stash.listFiles(id), work.id)
  const note = files.find((f) => f.name === 'Call Ada.txt')!
  const link = files.find((f) => f.name === 'Meeting notes.url')!
  expect(readFileSync(note.absolutePath, 'utf8')).toBe('Call Ada\nabout the invoice')
  expect(readFileSync(link.absolutePath, 'utf8')).toContain(`URL=${url}`)
  await page.evaluate((ids) => window.stash.removeFiles(ids), [note.id, link.id])
  await page.evaluate(() => window.stash.edgeMode('idle'))
})
