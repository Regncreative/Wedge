import { z } from 'zod'
import * as db from './database'
import { filePath } from './ipc-schemas'

/** Portable backup of shelves, file references and look-and-feel settings. */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const exportSchema = z.object({
  format: z.literal('stash-export'),
  version: z.literal(1),
  exportedAt: z.string(),
  shelves: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(100),
        icon: z.string().min(1).max(50),
        color: hexColor,
        sortOrder: z.number().int()
      })
    )
    .max(1_000),
  files: z
    .array(
      z.object({
        shelfId: z.string().min(1).max(100),
        absolutePath: filePath,
        name: z.string().min(1).max(1_000),
        extension: z.string().max(100),
        size: z.number().int().nonnegative(),
        isDirectory: z.boolean(),
        createdAt: z.number().int().nonnegative(),
        isPinned: z.boolean()
      })
    )
    .max(100_000),
  // Machine-specific settings (hotkey, autostart, default shelf) stay local.
  settings: z
    .object({
      theme: z.enum(['system', 'light', 'dark']),
      accentColor: hexColor,
      fileSort: z.enum(['added', 'name', 'recent', 'size']),
      idleOpacity: z.number().finite(),
      idleTimeoutSec: z.number().finite(),
      notifications: z.boolean()
    })
    .partial()
})

export type StashExport = z.infer<typeof exportSchema>

export function buildExport(): StashExport {
  const settings = db.getSettings()
  return {
    format: 'stash-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    shelves: db.listShelves().map(({ id, name, icon, color, sortOrder }) => ({
      id,
      name,
      icon,
      color,
      sortOrder
    })),
    files: db.listFiles(null).map((f) => ({
      shelfId: f.shelfId,
      absolutePath: f.absolutePath,
      name: f.name,
      extension: f.extension,
      size: f.size,
      isDirectory: f.isDirectory,
      createdAt: f.createdAt,
      isPinned: f.isPinned
    })),
    settings: {
      theme: settings.theme,
      accentColor: settings.accentColor,
      fileSort: settings.fileSort,
      idleOpacity: settings.idleOpacity,
      idleTimeoutSec: settings.idleTimeoutSec,
      notifications: settings.notifications
    }
  }
}

export class InvalidExportError extends Error {}

/**
 * Merge an export into the current data. Shelves are matched by name
 * (case-insensitive) or created; files already on a shelf are skipped.
 * Runs in one transaction, so a failure leaves nothing half-imported.
 */
export function applyImport(raw: unknown): { shelves: number; files: number } {
  const parsed = exportSchema.safeParse(raw)
  if (!parsed.success) throw new InvalidExportError(parsed.error.message)
  const data = parsed.data

  return db.getDb().transaction(() => {
    const byName = new Map(db.listShelves().map((s) => [s.name.toLowerCase(), s.id]))
    const shelfIdMap = new Map<string, string>()
    for (const shelf of [...data.shelves].sort((a, b) => a.sortOrder - b.sortOrder)) {
      let target = byName.get(shelf.name.toLowerCase())
      if (!target) {
        target = db.createShelf({ name: shelf.name, icon: shelf.icon, color: shelf.color }).id
        byName.set(shelf.name.toLowerCase(), target)
      }
      shelfIdMap.set(shelf.id, target)
    }

    let added = 0
    const touched = new Set<string>()
    for (const [exportedShelfId, target] of Array.from(shelfIdMap)) {
      const files = data.files.filter((f) => f.shelfId === exportedShelfId)
      if (files.length === 0) continue
      added += db.addFiles(files, target).added
      touched.add(target)
    }

    if (Object.keys(data.settings).length > 0) db.setSettings(data.settings)
    return { shelves: touched.size, files: added }
  })()
}
