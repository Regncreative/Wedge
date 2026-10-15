import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { deflateSync } from 'zlib'
import { launchApp, removeProfile, showShelf, tab, TAB_END, type LaunchedApp } from './app'

// UI text is Turkish on Turkish Windows and English elsewhere.
const ui = (tr: string, en: string) => new RegExp(`^(${tr}|${en})`)

/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

/** A noisy RGB PNG that compresses like a photo (for "Reduce size"). */
function noisyPng(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const raw = Buffer.alloc((w * 3 + 1) * h)
  let seed = 7
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const i = y * (w * 3 + 1) + 1 + x * 3
      raw[i] = (x + (seed & 31)) & 0xff
      raw[i + 1] = (y + ((seed >> 5) & 31)) & 0xff
      raw[i + 2] = (x + y) & 0xff
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

let stash: LaunchedApp
let work: string

async function addAndShow(page: Page, names: Record<string, string | Buffer>) {
  const paths = Object.entries(names).map(([name, body]) => {
    const p = join(work, name)
    writeFileSync(p, body)
    return p
  })
  await page.evaluate((ps) => window.stash.addFiles(ps), paths)
  await page.evaluate(() => window.stash.setSettings({ onboardingDone: true, fileSort: 'name' }))
  await page.reload()
  await page.locator('header').waitFor()
  return paths
}

const row = (page: Page, name: string) => page.getByRole('option', { name })

test.beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), 'stash-feat-'))
  stash = await launchApp()
})
test.afterEach(async () => {
  await stash.close()
  removeProfile(stash.userData)
  rmSync(work, { recursive: true, force: true })
})

test('new downloads land on an automatic shelf, and rules route them', async () => {
  const { page } = stash
  writeFileSync(join(stash.downloads, 'report.txt'), 'quarterly numbers')

  await expect
    .poll(
      async () => {
        const shelves = await page.evaluate(() => window.stash.listShelves())
        const dl = shelves.find((s) => s.kind === 'downloads')
        if (!dl) return []
        return (await page.evaluate((id) => window.stash.listFiles(id), dl.id)).map(
          (f) => `${f.name}:${f.source}`
        )
      },
      { timeout: 15_000 }
    )
    .toEqual(['report.txt:downloads'])

  // A rule sends PDFs from Downloads to the second shelf instead.
  const target = (await page.evaluate(() => window.stash.listShelves()))[1]
  await page.evaluate((id) => window.stash.addRule(id, 'pdf', 'downloads'), target.id)
  writeFileSync(join(stash.downloads, 'invoice.pdf'), '%PDF-1.4')
  await expect
    .poll(
      async () =>
        (await page.evaluate((id) => window.stash.listFiles(id), target.id)).map((f) => f.name),
      {
        timeout: 15_000
      }
    )
    .toEqual(['invoice.pdf'])
})

test('search finds words inside files', async () => {
  const { page } = stash
  await addAndShow(page, {
    'meeting.txt': 'Agenda: the flamingo budget review',
    'other.txt': 'nothing here'
  })

  const id = (await page.evaluate(() => window.stash.listFiles(null))).find(
    (f) => f.name === 'meeting.txt'
  )!.id
  await expect
    .poll(() => page.evaluate(() => window.stash.searchContent('flaming')), { timeout: 10_000 })
    .toEqual([id])

  await page.keyboard.press('Control+f')
  const search = page.getByRole('textbox', { name: ui('Ara', 'Search') })
  await expect(search).toBeVisible()
  await search.fill('flamingo')
  await expect(row(page, 'meeting.txt')).toBeVisible()
  await expect(row(page, 'other.txt')).toHaveCount(0)
})

test('notes, tags and reminders from the context menu', async () => {
  const { page } = stash
  await addAndShow(page, { 'contract.pdf': '%PDF' })

  await row(page, 'contract.pdf').click({ button: 'right' })
  await page.getByRole('menuitem', { name: ui('Not ve etiketler', 'Note and tags') }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').first().fill('Sign before Friday')
  await dialog.getByRole('textbox').nth(1).fill('legal, urgent')
  await dialog.getByRole('button', { name: ui('Kaydet', 'Save') }).click()
  await expect(page.getByText('Sign before Friday')).toBeVisible()
  await expect(page.getByText('urgent', { exact: true })).toBeVisible()

  await row(page, 'contract.pdf').click({ button: 'right' })
  await page.getByRole('menuitem', { name: ui('Hatırlat', 'Remind me') }).click()
  await page.getByRole('menuitem', { name: ui('1 saat sonra', 'In 1 hour') }).click()
  const [file] = await page.evaluate(() => window.stash.listFiles(null))
  expect(file.remindAt).toBeGreaterThan(Date.now() + 50 * 60_000)
  expect(file.tags).toBe('legal, urgent')
})

test('Space opens a preview of the focused file', async () => {
  const { page } = stash
  await addAndShow(page, { 'readme.md': '# Hello from the preview' })
  await row(page, 'readme.md').click()
  await page.keyboard.press(' ')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Hello from the preview')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('quick actions: zip a selection and convert an image', async () => {
  const { page } = stash
  await addAndShow(page, { 'a.txt': 'a', 'pic.png': PNG })

  await row(page, 'a.txt').click()
  await row(page, 'pic.png').click({ modifiers: ['Shift'] })
  await page.getByRole('toolbar').getByRole('button', { name: 'ZIP' }).click()
  await expect.poll(() => existsSync(join(work, 'Stash.zip'))).toBe(true)
  await expect(row(page, 'Stash.zip')).toBeVisible()

  await page.keyboard.press('Escape')
  await row(page, 'pic.png').click({ button: 'right' })
  await page.getByRole('menuitem', { name: ui('Dönüştür', 'Convert') }).click()
  await page.getByRole('menuitem', { name: ui('JPG olarak kaydet', 'Save as JPG') }).click()
  await expect.poll(() => existsSync(join(work, 'pic.jpg'))).toBe(true)
})

test('Ctrl+V adds a copied link to the shelf', async () => {
  const { page } = stash
  await addAndShow(page, {})
  const ps = (cmd: string) =>
    execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' })
  // Reading fails while the clipboard holds no text (or the session is locked).
  let previous = ''
  try {
    previous = ps('Get-Clipboard -Raw')
  } catch {
    previous = ''
  }
  try {
    ps("Set-Clipboard -Value 'https://www.example.com/docs/page'")
    await page.locator('header').click()
    await page.keyboard.press('Control+v')
    await expect(row(page, 'example.com.url')).toBeVisible()
  } finally {
    // Put the developer's clipboard back.
    if (previous.trim())
      execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value $input'], {
        input: previous
      })
  }
})

test('files sent from a phone land on their own shelf', async () => {
  const { page } = stash
  await addAndShow(page, {})
  await page.getByRole('button', { name: ui('Telefondan al', 'Receive from phone') }).click()
  const url = (await page
    .getByRole('dialog')
    .getByText(/^http:\/\//)
    .textContent())!.trim()
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/)

  const res = await fetch(`${url}/upload?name=${encodeURIComponent('IMG 0001.jpg')}`, {
    method: 'PUT',
    body: 'jpeg'
  })
  expect(res.ok).toBe(true)
  // Wrong token is refused.
  const bad = await fetch(url.replace(/[0-9a-f]{32}$/, '0'.repeat(32)), { method: 'GET' })
  expect(bad.status).toBe(404)

  await expect
    .poll(async () => {
      const shelves = await page.evaluate(() => window.stash.listShelves())
      const phone = shelves.find((s) => s.kind === 'phone')
      return phone
        ? (await page.evaluate((id) => window.stash.listFiles(id), phone.id)).map((f) => f.name)
        : []
    })
    .toEqual(['IMG 0001.jpg'])
})

test('temporary shelves and desktop widgets from the shelf menu', async () => {
  const { page, browser } = stash
  await addAndShow(page, { 'note.txt': 'x' })
  const first = (await page.evaluate(() => window.stash.listShelves()))[0]

  await tab(page, first.name).click({ ...TAB_END, button: 'right' })
  await page.getByRole('menuitem', { name: ui('Geçici raf', 'Temporary shelf') }).click()
  await page.getByRole('menuitemradio', { name: ui('24 saat', 'Clear after 24') }).click()
  await expect
    .poll(async () => (await page.evaluate(() => window.stash.listShelves()))[0].expireHours)
    .toBe(24)

  await tab(page, first.name).click({ ...TAB_END, button: 'right' })
  await page.getByRole('menuitem', { name: ui('Masaüstüne sabitle', 'Pin to desktop') }).click()
  const widget = await expect
    .poll(
      () =>
        browser
          .contexts()[0]
          .pages()
          .find((p) => p.url().includes('view=widget')) ?? null
    )
    .not.toBeNull()
    .then(() =>
      browser
        .contexts()[0]
        .pages()
        .find((p) => p.url().includes('view=widget'))!
    )
  await expect(widget.getByText(first.name)).toBeVisible()
  await expect(widget.getByText('note.txt')).toBeVisible()
})

test('the shelves live on the screen edge: tucked in, out for a drag, open as a drawer', async () => {
  const { page } = stash
  await addAndShow(page, {})
  const state = () =>
    page.evaluate(async () => ({
      width: innerWidth,
      left: screenX,
      mode: (await window.stash.edgeState()).mode,
      shown: document.querySelector<HTMLElement>('.edge-root')?.dataset.mode
    }))

  // Open (the test harness opens the drawer at start): the drawer plus tab ends.
  expect(await state()).toMatchObject({ mode: 'open', shown: 'open' })
  expect((await state()).width).toBeGreaterThan(400)

  // Closing tucks the tabs in to a sliver that can't catch clicks elsewhere.
  await page
    .getByRole('button', { name: ui('Kapat', 'Close') })
    .first()
    .click()
  await expect.poll(async () => (await state()).width).toBeLessThan(20)
  expect(await state()).toMatchObject({ mode: 'idle', shown: 'idle' })

  // A drag anywhere brings the tabs out; the pocket is first.
  await page.evaluate(() => window.stash.edgeMode('drag'))
  await expect.poll(async () => (await state()).width).toBeGreaterThan(200)
  const labels = await page
    .locator('.tab')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(labels[0]).toMatch(/^(Cep|Pocket), /)

  // Clicking a tab opens its shelf in the drawer.
  const second = (await page.evaluate(() => window.stash.listShelves())).find(
    (s) => s.kind !== 'pocket'
  )!
  await tab(page, second.name).click()
  await expect.poll(async () => (await state()).mode).toBe('open')
  await expect(page.locator('.drawer header h1')).toHaveText(second.name)

  // The other edge.
  await page.evaluate(() => window.stash.setSettings({ edgeHandle: 'left' }))
  await expect.poll(async () => (await state()).left).toBeLessThan(20)
  await expect(page.locator('.edge-root')).toHaveAttribute('data-side', 'left')

  // The pocket can't be deleted.
  const pocket = (await page.evaluate(() => window.stash.listShelves())).find(
    (s) => s.kind === 'pocket'
  )!
  const err = await page.evaluate(
    (id) =>
      window.stash.deleteShelf(id).then(
        () => 'deleted',
        (e: unknown) => String(e)
      ),
    pocket.id
  )
  expect(err).toContain('pocket')
})

test('a shared shelf mirrors its folder both ways', async () => {
  const { page } = stash
  await addAndShow(page, {})
  const folder = mkdtempSync(join(tmpdir(), 'stash-shared-'))
  try {
    writeFileSync(join(folder, 'from-a-friend.pdf'), '%PDF')
    const shelf = await page.evaluate((f) => window.stash.createSharedShelf(f), folder)
    expect(shelf.kind).toBe('shared')
    expect(shelf.folder).toBe(folder)
    const names = () =>
      page.evaluate(
        (id) => window.stash.listFiles(id).then((fs) => fs.map((f) => f.name).sort()),
        shelf.id
      )
    expect(await names()).toEqual(['from-a-friend.pdf'])

    // Adding a file copies it into the folder.
    const mine = join(work, 'my notes.txt')
    writeFileSync(mine, 'hello')
    await page.evaluate(([p, id]) => window.stash.addFiles([p], id), [mine, shelf.id])
    expect(readFileSync(join(folder, 'my notes.txt'), 'utf8')).toBe('hello')
    expect(await names()).toEqual(['from-a-friend.pdf', 'my notes.txt'])

    // A friend adds and deletes files in the folder.
    writeFileSync(join(folder, 'photo.jpg'), 'jpg')
    rmSync(join(folder, 'from-a-friend.pdf'))
    await expect.poll(names, { timeout: 15_000 }).toEqual(['my notes.txt', 'photo.jpg'])

    // Removing from the shelf deletes it from the folder (Recycle Bin; a test folder here).
    const photo = (await page.evaluate((id) => window.stash.listFiles(id), shelf.id)).find(
      (f) => f.name === 'photo.jpg'
    )!
    await page.evaluate((id) => window.stash.removeFiles([id]), photo.id)
    expect(existsSync(join(folder, 'photo.jpg'))).toBe(false)
    expect(readdirSync(stash.trash)).toEqual(['photo.jpg'])

    // Files can't be moved out of a shared shelf; the UI shows it in the rail.
    const notes = (await page.evaluate((id) => window.stash.listFiles(id), shelf.id))[0]
    const other = (await page.evaluate(() => window.stash.listShelves()))[0]
    const err = await page.evaluate(
      ([id, to]) =>
        window.stash.moveFile(id, to).then(
          () => 'moved',
          (e: unknown) => String(e)
        ),
      [notes.id, other.id]
    )
    expect(err).toContain('shared_move')
    await page.reload()
    await showShelf(page, shelf.name)
    await expect(page.locator('header')).toContainText(/Paylaşılan|Shared/)
    await expect(row(page, 'my notes.txt')).toBeVisible()
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('reduce size makes a smaller copy and reports the sizes', async () => {
  const { page } = stash
  await addAndShow(page, { 'big photo.png': noisyPng(1600, 1000) })
  await row(page, 'big photo.png').click({ button: 'right' })
  await page.getByRole('menuitem', { name: ui('Boyutunu küçült', 'Reduce size') }).click()
  await expect(page.getByRole('status')).toContainText('→')
  // "big photo-small.jpg" (or "-küçük" in Turkish), next to the original.
  const smaller = () => readdirSync(work).find((f) => /^big photo-.+\.jpg$/.test(f))
  await expect.poll(smaller).toBeTruthy()
  const out = join(work, smaller()!)
  expect(statSync(out).size).toBeLessThan(statSync(join(work, 'big photo.png')).size)
  await expect(row(page, basename(out))).toBeVisible()
})
