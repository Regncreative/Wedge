import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, removeProfile, type LaunchedApp } from './app'

// UI text is Turkish on Turkish Windows and English elsewhere.
const ui = (tr: string, en: string) => new RegExp(`^(${tr}|${en})`)

/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

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
        return (await page.evaluate((id) => window.stash.listFiles(id), dl.id)).map((f) => `${f.name}:${f.source}`)
      },
      { timeout: 15_000 }
    )
    .toEqual(['report.txt:downloads'])

  // A rule sends PDFs from Downloads to the second shelf instead.
  const target = (await page.evaluate(() => window.stash.listShelves()))[1]
  await page.evaluate((id) => window.stash.addRule(id, 'pdf', 'downloads'), target.id)
  writeFileSync(join(stash.downloads, 'invoice.pdf'), '%PDF-1.4')
  await expect
    .poll(async () => (await page.evaluate((id) => window.stash.listFiles(id), target.id)).map((f) => f.name), {
      timeout: 15_000
    })
    .toEqual(['invoice.pdf'])
})

test('search finds words inside files', async () => {
  const { page } = stash
  await addAndShow(page, { 'meeting.txt': 'Agenda: the flamingo budget review', 'other.txt': 'nothing here' })

  const id = (await page.evaluate(() => window.stash.listFiles(null))).find((f) => f.name === 'meeting.txt')!.id
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
  const previous = ps('Get-Clipboard -Raw')
  try {
    ps("Set-Clipboard -Value 'https://www.example.com/docs/page'")
    await page.locator('header').click()
    await page.keyboard.press('Control+v')
    await expect(row(page, 'example.com.url')).toBeVisible()
  } finally {
    // Put the developer's clipboard back.
    if (previous.trim()) execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Set-Clipboard -Value $input'], { input: previous })
  }
})

test('files sent from a phone land on their own shelf', async () => {
  const { page } = stash
  await addAndShow(page, {})
  await page.getByRole('button', { name: ui('Telefondan al', 'Receive from phone') }).click()
  const url = (await page.getByRole('dialog').getByText(/^http:\/\//).textContent())!.trim()
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/)

  const res = await fetch(`${url}/upload?name=${encodeURIComponent('IMG 0001.jpg')}`, { method: 'PUT', body: 'jpeg' })
  expect(res.ok).toBe(true)
  // Wrong token is refused.
  const bad = await fetch(url.replace(/[0-9a-f]{32}$/, '0'.repeat(32)), { method: 'GET' })
  expect(bad.status).toBe(404)

  await expect
    .poll(async () => {
      const shelves = await page.evaluate(() => window.stash.listShelves())
      const phone = shelves.find((s) => s.kind === 'phone')
      return phone ? (await page.evaluate((id) => window.stash.listFiles(id), phone.id)).map((f) => f.name) : []
    })
    .toEqual(['IMG 0001.jpg'])
})

test('temporary shelves and desktop widgets from the shelf menu', async () => {
  const { page, browser } = stash
  await addAndShow(page, { 'note.txt': 'x' })
  const first = (await page.evaluate(() => window.stash.listShelves()))[0]

  await page.getByRole('button', { name: new RegExp(first.name) }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: ui('Geçici raf', 'Temporary shelf') }).click()
  await page.getByRole('menuitemradio', { name: ui('24 saat', 'Clear after 24') }).click()
  await expect
    .poll(async () => (await page.evaluate(() => window.stash.listShelves()))[0].expireHours)
    .toBe(24)

  await page.getByRole('button', { name: new RegExp(first.name) }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: ui('Masaüstüne sabitle', 'Pin to desktop') }).click()
  const widget = await expect
    .poll(() => browser.contexts()[0].pages().find((p) => p.url().includes('view=widget')) ?? null)
    .not.toBeNull()
    .then(() => browser.contexts()[0].pages().find((p) => p.url().includes('view=widget'))!)
  await expect(widget.getByText(first.name)).toBeVisible()
  await expect(widget.getByText('note.txt')).toBeVisible()
})

test('the drop shelf collects files and lists them', async () => {
  const { page, browser } = stash
  await addAndShow(page, {})
  await page.evaluate(() => window.stash.openDropShelf())
  await expect
    .poll(() => browser.contexts()[0].pages().some((p) => p.url().includes('view=drop')))
    .toBe(true)
  const drop = browser.contexts()[0].pages().find((p) => p.url().includes('view=drop'))!
  await drop.waitForFunction(() => Boolean(window.stash))
  await expect(drop.getByText(/Dosyaları buraya bırak|Drop files here/)).toBeVisible()

  // Same path the window's drop handler takes.
  const p = join(work, 'collected.txt')
  writeFileSync(p, 'x')
  const shelf = await drop.evaluate(() => window.stash.dropShelf())
  expect(shelf.kind).toBe('drop')
  expect(shelf.expireHours).toBe(24)
  await drop.evaluate(([path, id]) => window.stash.addFiles([path], id), [p, shelf.id])
  await drop.reload()
  await expect(drop.getByText('collected.txt')).toBeVisible()
  await expect(drop.getByRole('button', { name: /Hepsini sürükle|Drag all/ })).toBeVisible()
})

test('sync publishes this PC and merges another one', async () => {
  const { page } = stash
  await addAndShow(page, { 'shared.txt': 'x' })
  const folder = mkdtempSync(join(tmpdir(), 'stash-sync-'))
  try {
    await page.evaluate((f) => window.stash.setSettings({ syncFolder: f }), folder)
    await page.evaluate(() => window.stash.syncNow())
    expect(readdirSync(folder).filter((f) => f.endsWith('.json'))).toHaveLength(1)

    const remote = join(work, 'from-laptop.txt')
    writeFileSync(remote, 'y')
    writeFileSync(
      join(folder, 'laptop-device.json'),
      JSON.stringify({
        format: 'stash-sync',
        version: 1,
        device: 'laptop-device',
        deviceName: 'LAPTOP',
        updatedAt: Date.now(),
        shelves: [{ name: 'Synced shelf', icon: 'folder', color: '#00B294' }],
        files: [
          {
            shelf: 'Synced shelf',
            path: remote,
            name: 'from-laptop.txt',
            extension: 'txt',
            size: 1,
            isDirectory: false,
            createdAt: 1,
            addedAt: Date.now(),
            isPinned: false,
            note: '',
            tags: ''
          }
        ],
        deleted: []
      })
    )
    const devices = await page.evaluate(() => window.stash.syncNow())
    expect(devices.map((d) => d.name)).toContain('LAPTOP')
    const shelves = await page.evaluate(() => window.stash.listShelves())
    const synced = shelves.find((s) => s.name === 'Synced shelf')!
    expect((await page.evaluate((id) => window.stash.listFiles(id), synced.id)).map((f) => f.name)).toEqual([
      'from-laptop.txt'
    ])
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
