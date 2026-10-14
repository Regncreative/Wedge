import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getLocale: () => 'en-US' }
}))

import * as db from '../../src/main/database'
import { SCHEMA_VERSION, migrations } from '../../src/main/database/migrations'
import type { FileInput } from '../../src/main/database'

function file(path: string, overrides: Partial<FileInput> = {}): FileInput {
  return {
    absolutePath: path,
    name: path.split('\\').pop() ?? path,
    extension: path.split('.').pop() ?? '',
    size: 100,
    isDirectory: false,
    createdAt: 1,
    ...overrides
  }
}

describe('database', () => {
  beforeEach(() => db.initDatabase(':memory:'))
  afterEach(() => db.closeDatabase())

  it('seeds three default shelves and points the default shelf at the first', () => {
    const shelves = db.listShelves()
    expect(shelves.map((s) => s.name)).toEqual(['Work', 'Personal', 'Temporary'])
    expect(db.getSettings().defaultShelfId).toBe(shelves[0].id)
  })

  it('skips files that are already on the same shelf', () => {
    const [work, personal] = db.listShelves()
    expect(db.addFiles([file('C:\\a.txt'), file('C:\\b.txt')], work.id).added).toBe(2)

    const again = db.addFiles([file('C:\\a.txt')], work.id)
    expect(again).toMatchObject({ added: 0, skipped: 1 })

    // The same path may live on a different shelf.
    expect(db.addFiles([file('C:\\a.txt')], personal.id).added).toBe(1)
  })

  it('lists pinned files first, then newest', () => {
    const [work] = db.listShelves()
    const { ids } = db.addFiles([file('C:\\old.txt')], work.id)
    db.addFiles([file('C:\\new.txt')], work.id)
    db.setFilePinned(ids[0], true)

    expect(db.listFiles(work.id).map((f) => f.name)).toEqual(['old.txt', 'new.txt'])
  })

  it('moves and batch-removes files', () => {
    const [work, personal] = db.listShelves()
    const { ids } = db.addFiles([file('C:\\a.txt'), file('C:\\b.txt'), file('C:\\c.txt')], work.id)

    db.moveFile(ids[0], personal.id)
    expect(db.listFiles(personal.id)).toHaveLength(1)

    db.removeFiles([ids[1], ids[2]])
    expect(db.listFiles(work.id)).toHaveLength(0)
    expect(db.getStats()).toMatchObject({ fileCount: 1, totalSize: 100 })
  })

  it('deletes a shelf with its files and heals the default shelf', () => {
    const [work, personal] = db.listShelves()
    db.addFiles([file('C:\\a.txt')], work.id)
    db.setSettings({ defaultShelfId: work.id, lastShelfId: work.id })

    db.deleteShelf(work.id)

    expect(db.listFiles(null)).toHaveLength(0)
    const settings = db.getSettings()
    expect(settings.defaultShelfId).toBe(personal.id)
    expect(settings.lastShelfId).toBe(personal.id)
  })

  it('refuses to delete the last shelf', () => {
    const [a, b, c] = db.listShelves()
    db.deleteShelf(a.id)
    db.deleteShelf(b.id)
    expect(() => db.deleteShelf(c.id)).toThrow('Cannot delete the last shelf')
  })

  it('persists settings, clamps numbers and never stores the language', () => {
    const next = db.setSettings({ idleOpacity: 5, idleTimeoutSec: 1, language: 'tr' })
    expect(next.idleOpacity).toBe(0.7)
    expect(next.idleTimeoutSec).toBe(5)

    const stored = db
      .getDb()
      .prepare("SELECT value FROM settings WHERE key = 'language'")
      .get() as { value: string }
    expect(JSON.parse(stored.value)).toBe('en') // seeded default, not the override
    expect(db.getSettings().language).toBe('en') // follows the (mocked) OS locale
  })

  it('updates shelves and keeps order', () => {
    const created = db.createShelf({ name: 'Downloads' })
    expect(created.sortOrder).toBe(3)
    db.updateShelf(created.id, { name: 'DL', color: '#000000', sortOrder: -1 })
    expect(db.listShelves()[0]).toMatchObject({ name: 'DL', color: '#000000' })
  })

  it('stays fast with 10,000 files', () => {
    const [work] = db.listShelves()
    const many = Array.from({ length: 10_000 }, (_, i) => file(`C:\\data\\file-${i}.txt`))

    const t0 = performance.now()
    db.addFiles(many, work.id)
    const listed = db.listFiles(null)
    const elapsed = performance.now() - t0

    expect(listed).toHaveLength(10_000)
    expect(elapsed).toBeLessThan(2000)
  })
})

describe('migrations', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stash-test-'))
  })
  afterEach(() => {
    db.closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  it('stamps a fresh database with the current schema version and makes no backup', () => {
    const path = join(dir, 'stash.db')
    db.initDatabase(path)
    expect(db.getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(existsSync(`${path}.backup`)).toBe(false)
  })

  it('upgrades a pre-versioning database in place and backs it up first', () => {
    const path = join(dir, 'stash.db')
    // Simulate a v1.0.x install: tables exist, user_version is still 0.
    const legacy = new Database(path)
    migrations[0](legacy)
    legacy
      .prepare('INSERT INTO shelves (id, name, created_at) VALUES (?, ?, ?)')
      .run('legacy', 'Old shelf', 1)
    legacy.close()

    db.initDatabase(path)

    expect(db.getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(db.listShelves().map((s) => s.name)).toEqual(['Old shelf'])
    expect(existsSync(`${path}.backup`)).toBe(true)
  })

  it('leaves a newer schema untouched', () => {
    const path = join(dir, 'stash.db')
    const future = new Database(path)
    migrations[0](future)
    future.pragma(`user_version = ${SCHEMA_VERSION + 5}`)
    future.close()

    db.initDatabase(path)
    expect(db.getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION + 5)
  })
})
