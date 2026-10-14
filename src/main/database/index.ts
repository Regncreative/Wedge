import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  AppSettings,
  DEFAULT_SETTINGS,
  Shelf,
  ShelfStats,
  StashFile,
  getDefaultShelves,
  normalizeSettings
} from '../../shared/types'
import { resolveSystemLanguage } from '../../shared/i18n'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

/** Opens (and migrates) the database. `dbPath` overrides the userData location, e.g. ':memory:' in tests. */
export function initDatabase(dbPath = join(app.getPath('userData'), 'stash.db')): void {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db, dbPath === ':memory:' ? undefined : `${dbPath}.backup`)
  seedDefaults(db)
}

function seedDefaults(database: Database.Database): void {
  const count = database.prepare('SELECT COUNT(*) as c FROM shelves').get() as { c: number }
  if (count.c === 0) {
    const insert = database.prepare(
      `INSERT INTO shelves (id, name, icon, color, created_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const now = Date.now()
    const ids: string[] = []
    const lang = resolveSystemLanguage(app.getLocale())
    for (const shelf of getDefaultShelves(lang)) {
      const id = randomUUID()
      ids.push(id)
      insert.run(id, shelf.name, shelf.icon, shelf.color, now, shelf.sortOrder)
    }

    // Persist default shelf id
    setSettingRaw(database, 'defaultShelfId', ids[0])
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = database.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!existing && key !== 'defaultShelfId') {
      setSettingRaw(database, key, value)
    }
  }
}

function setSettingRaw(database: Database.Database, key: string, value: unknown): void {
  database
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, JSON.stringify(value))
}

function mapShelf(row: Record<string, unknown>): Shelf {
  return {
    id: row.id as string,
    name: row.name as string,
    icon: row.icon as string,
    color: row.color as string,
    createdAt: row.created_at as number,
    sortOrder: row.sort_order as number
  }
}

function mapFile(row: Record<string, unknown>): StashFile {
  return {
    id: row.id as string,
    shelfId: row.shelf_id as string,
    absolutePath: row.absolute_path as string,
    name: row.name as string,
    extension: row.extension as string,
    size: row.size as number,
    isDirectory: Boolean(row.is_directory),
    createdAt: row.created_at as number,
    addedAt: row.added_at as number,
    lastAccessed: (row.last_accessed as number | null) ?? null,
    isPinned: Boolean(row.is_pinned),
    exists: true
  }
}

// ── Shelves ──────────────────────────────────────────────

export function listShelves(): Shelf[] {
  const rows = getDb()
    .prepare('SELECT * FROM shelves ORDER BY sort_order ASC, created_at ASC')
    .all() as Record<string, unknown>[]
  return rows.map(mapShelf)
}

export function createShelf(input: {
  name: string
  icon?: string
  color?: string
}): Shelf {
  const id = randomUUID()
  const now = Date.now()
  const maxOrder = getDb().prepare('SELECT MAX(sort_order) as m FROM shelves').get() as {
    m: number | null
  }
  const sortOrder = (maxOrder.m ?? -1) + 1
  const icon = input.icon ?? 'folder'
  const color = input.color ?? '#0078D4'
  getDb()
    .prepare(
      `INSERT INTO shelves (id, name, icon, color, created_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.name, icon, color, now, sortOrder)
  return { id, name: input.name, icon, color, createdAt: now, sortOrder }
}

export function renameShelf(id: string, name: string): void {
  getDb().prepare('UPDATE shelves SET name = ? WHERE id = ?').run(name, id)
}

export function updateShelf(
  id: string,
  updates: Partial<Pick<Shelf, 'name' | 'icon' | 'color' | 'sortOrder'>>
): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?')
    values.push(updates.icon)
  }
  if (updates.color !== undefined) {
    fields.push('color = ?')
    values.push(updates.color)
  }
  if (updates.sortOrder !== undefined) {
    fields.push('sort_order = ?')
    values.push(updates.sortOrder)
  }
  if (fields.length === 0) return
  values.push(id)
  getDb()
    .prepare(`UPDATE shelves SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values)
}

export function deleteShelf(id: string): void {
  const shelves = listShelves()
  if (shelves.length <= 1) {
    throw new Error('Cannot delete the last shelf')
  }
  getDb().prepare('DELETE FROM shelves WHERE id = ?').run(id)
  // Heal default/last shelf if the deleted one was selected.
  getSettings()
}

// ── Files ────────────────────────────────────────────────

export function listFiles(shelfId?: string | null): StashFile[] {
  let rows: Record<string, unknown>[]
  if (shelfId) {
    rows = getDb()
      .prepare(
        `SELECT * FROM files WHERE shelf_id = ?
         ORDER BY is_pinned DESC, added_at DESC`
      )
      .all(shelfId) as Record<string, unknown>[]
  } else {
    rows = getDb()
      .prepare(`SELECT * FROM files ORDER BY is_pinned DESC, added_at DESC`)
      .all() as Record<string, unknown>[]
  }
  return rows.map(mapFile)
}

export interface FileInput {
  absolutePath: string
  name: string
  extension: string
  size: number
  isDirectory: boolean
  createdAt: number
}

export function addFiles(
  files: FileInput[],
  shelfId: string
): { added: number; skipped: number; ids: string[] } {
  const insert = getDb().prepare(
    `INSERT OR IGNORE INTO files
      (id, shelf_id, absolute_path, name, extension, size, is_directory,
       created_at, added_at, last_accessed, is_pinned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`
  )

  const now = Date.now()
  let added = 0
  let skipped = 0
  const ids: string[] = []

  const tx = getDb().transaction((items: FileInput[]) => {
    for (const file of items) {
      const id = randomUUID()
      const result = insert.run(
        id,
        shelfId,
        file.absolutePath,
        file.name,
        file.extension,
        file.size,
        file.isDirectory ? 1 : 0,
        file.createdAt,
        now
      )
      if (result.changes > 0) {
        added++
        ids.push(id)
      } else {
        skipped++
      }
    }
  })

  tx(files)
  return { added, skipped, ids }
}

export function removeFile(id: string): void {
  getDb().prepare('DELETE FROM files WHERE id = ?').run(id)
}

export function removeFiles(ids: string[]): void {
  if (ids.length === 0) return
  const remove = getDb().prepare('DELETE FROM files WHERE id = ?')
  getDb().transaction((items: string[]) => {
    for (const id of items) remove.run(id)
  })(ids)
}

export function setFilePinned(id: string, pinned: boolean): void {
  getDb().prepare('UPDATE files SET is_pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
}

export function moveFile(id: string, shelfId: string): void {
  getDb().prepare('UPDATE files SET shelf_id = ? WHERE id = ?').run(shelfId, id)
}

export function touchFileAccessed(id: string): void {
  getDb().prepare('UPDATE files SET last_accessed = ? WHERE id = ?').run(Date.now(), id)
}

export function getFileById(id: string): StashFile | null {
  const row = getDb().prepare('SELECT * FROM files WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? mapFile(row) : null
}

// ── Stats ────────────────────────────────────────────────

export function getStats(): ShelfStats {
  const shelfCount = (getDb().prepare('SELECT COUNT(*) as c FROM shelves').get() as { c: number }).c
  const fileRow = getDb().prepare('SELECT COUNT(*) as c, COALESCE(SUM(size), 0) as s FROM files').get() as {
    c: number
    s: number
  }
  return {
    shelfCount,
    fileCount: fileRow.c,
    totalSize: fileRow.s
  }
}

// ── Settings ─────────────────────────────────────────────

export function getSettings(): AppSettings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const map = new Map(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]))
  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    if (map.has(key)) {
      ;(settings as Record<string, unknown>)[key] = map.get(key)
    } else if (key !== 'defaultShelfId') {
      // Persist newly added setting keys for existing installs.
      setSettingRaw(getDb(), key, DEFAULT_SETTINGS[key])
    }
  }
  const shelves = listShelves()
  const shelfIds = new Set(shelves.map((s) => s.id))
  if (!settings.defaultShelfId || !shelfIds.has(settings.defaultShelfId)) {
    settings.defaultShelfId = shelves[0]?.id ?? ''
    if (settings.defaultShelfId) {
      setSettingRaw(getDb(), 'defaultShelfId', settings.defaultShelfId)
    }
  }
  if (!settings.lastShelfId || !shelfIds.has(settings.lastShelfId)) {
    settings.lastShelfId = settings.defaultShelfId
    if (settings.lastShelfId) {
      setSettingRaw(getDb(), 'lastShelfId', settings.lastShelfId)
    }
  }
  const next = normalizeSettings(settings)
  // Language always follows the OS — ignore any stored preference.
  next.language = resolveSystemLanguage(app.getLocale())
  return next
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next = normalizeSettings({ ...current, ...partial })
  next.language = resolveSystemLanguage(app.getLocale())
  const toWrite: Partial<AppSettings> = { ...partial }
  // Language is system-driven; never persist a manual override.
  delete toWrite.language
  if (partial.idleOpacity !== undefined) {
    toWrite.idleOpacity = next.idleOpacity
  }
  if (partial.idleTimeoutSec !== undefined) {
    toWrite.idleTimeoutSec = next.idleTimeoutSec
  }
  for (const [key, value] of Object.entries(toWrite)) {
    if (value !== undefined) {
      setSettingRaw(getDb(), key, value)
    }
  }
  return next
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
