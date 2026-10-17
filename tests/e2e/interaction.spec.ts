import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, removeProfile, type LaunchedApp } from './app'

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
