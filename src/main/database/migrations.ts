import type Database from 'better-sqlite3'
import { existsSync, unlinkSync } from 'fs'

type Migration = (db: Database.Database) => void

/**
 * Ordered schema migrations; the database's `user_version` is the number
 * already applied. Append new entries — never edit one that has shipped.
 */
export const migrations: Migration[] = [
  // 1 — initial schema. Installs from before versioning already have these
  // tables with user_version 0, so every statement must stay idempotent.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shelves (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT 'folder',
        color TEXT NOT NULL DEFAULT '#0078D4',
        created_at INTEGER NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        shelf_id TEXT NOT NULL,
        absolute_path TEXT NOT NULL,
        name TEXT NOT NULL,
        extension TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        is_directory INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        added_at INTEGER NOT NULL,
        last_accessed INTEGER,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_files_path_shelf
        ON files(absolute_path, shelf_id);
      CREATE INDEX IF NOT EXISTS idx_files_shelf ON files(shelf_id);
      CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
      CREATE INDEX IF NOT EXISTS idx_files_ext ON files(extension);
      CREATE INDEX IF NOT EXISTS idx_files_pinned ON files(is_pinned);
      CREATE INDEX IF NOT EXISTS idx_files_added ON files(added_at DESC);
    `)
  }
]

export const SCHEMA_VERSION = migrations.length

function getUserVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number
}

function hasUserTables(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'shelves'")
    .get() as { c: number }
  return row.c > 0
}

/**
 * Bring the schema up to date. When an existing database is about to be
 * migrated, a snapshot is written to `backupPath` first so a failed or
 * buggy migration never costs the user their shelves.
 */
export function runMigrations(db: Database.Database, backupPath?: string): void {
  const current = getUserVersion(db)
  if (current > SCHEMA_VERSION) {
    // Opened by an older build after a newer one ran; leave the schema alone.
    console.warn(`[stash] database schema v${current} is newer than this build (v${SCHEMA_VERSION})`)
    return
  }
  if (current === SCHEMA_VERSION) return

  if (backupPath && hasUserTables(db)) {
    if (existsSync(backupPath)) unlinkSync(backupPath)
    db.prepare('VACUUM INTO ?').run(backupPath)
  }

  for (let version = current; version < SCHEMA_VERSION; version++) {
    db.transaction(() => {
      migrations[version](db)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}
