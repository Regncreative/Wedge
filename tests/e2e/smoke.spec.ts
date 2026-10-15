import { expect, test } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchApp, removeProfile } from './app'

let workDir: string

test.beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'stash-files-'))
})
test.afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

test('starts, lists default shelves and shows an added file', async () => {
  const stash = await launchApp()
  try {
    const { page } = stash
    const shelves = await page.evaluate(() => window.stash.listShelves())
    // Three default shelves plus the pocket at the top of the edge.
    expect(shelves.filter((s) => s.kind !== 'pocket')).toHaveLength(3)
    expect(shelves.filter((s) => s.kind === 'pocket')).toHaveLength(1)

    const report = join(workDir, 'quarterly report.pdf')
    writeFileSync(report, 'pdf')
    const result = await page.evaluate((p) => window.stash.addFiles([p]), report)
    expect(result.added).toBe(1)

    await page.reload()
    await expect(page.getByText('quarterly report.pdf')).toBeVisible()

    const logFile = join(stash.userData, 'logs', 'main.log')
    expect(existsSync(logFile)).toBe(true)
    expect(readFileSync(logFile, 'utf8')).toContain('starting')
  } finally {
    await stash.close()
    removeProfile(stash.userData)
  }
})

test('flags a file that disappeared from disk', async () => {
  const stash = await launchApp()
  try {
    const { page } = stash
    const gone = join(workDir, 'temp.txt')
    writeFileSync(gone, 'x')
    await page.evaluate((p) => window.stash.addFiles([p]), gone)
    rmSync(gone)

    const files = await page.evaluate(() => window.stash.listFiles(null))
    expect(files).toHaveLength(1)
    expect(files[0].exists).toBe(false)
  } finally {
    await stash.close()
    removeProfile(stash.userData)
  }
})

test('rejects malformed commands from the panel', async () => {
  const stash = await launchApp()
  try {
    const error = await stash.page.evaluate(() =>
      window.stash
        .setSettings({ isAdmin: true } as never)
        .then(() => null)
        .catch((e: unknown) => String(e))
    )
    // Rejected by serde (deny_unknown_fields) before reaching any code.
    expect(error).toContain('isAdmin')
  } finally {
    await stash.close()
    removeProfile(stash.userData)
  }
})

test('keeps shelves and settings across restarts', async () => {
  const first = await launchApp()
  const userData = first.userData
  await first.page.evaluate(() => window.stash.createShelf({ name: 'Invoices' }))
  await first.page.evaluate(() => window.stash.setSettings({ fileSort: 'name' }))
  await first.close()

  const second = await launchApp(userData)
  try {
    const shelves = await second.page.evaluate(() => window.stash.listShelves())
    expect(shelves.map((s) => s.name)).toContain('Invoices')
    const settings = await second.page.evaluate(() => window.stash.getSettings())
    expect(settings.fileSort).toBe('name')
  } finally {
    await second.close()
    removeProfile(userData)
  }
})
