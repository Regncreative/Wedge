import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), getLocale: () => 'en-US' }
}))

import * as db from '../../src/main/database'
import { InvalidExportError, applyImport, buildExport } from '../../src/main/data-transfer'

const file = (path: string) => ({
  absolutePath: path,
  name: path.split('\\').pop() ?? path,
  extension: 'txt',
  size: 10,
  isDirectory: false,
  createdAt: 1
})

describe('export / import', () => {
  beforeEach(() => db.initDatabase(':memory:'))
  afterEach(() => db.closeDatabase())

  function seedAndExport() {
    const [work] = db.listShelves()
    const invoices = db.createShelf({ name: 'Invoices', color: '#00B294' })
    const { ids } = db.addFiles([file('C:\\a.txt'), file('C:\\b.txt')], work.id)
    db.setFilePinned(ids[0], true)
    db.addFiles([file('C:\\inv.txt')], invoices.id)
    db.setSettings({ theme: 'light', fileSort: 'name', openHotkey: 'Alt+Q' })
    return JSON.parse(JSON.stringify(buildExport())) as unknown
  }

  it('round-trips shelves, files, pins and look-and-feel settings', () => {
    const exported = seedAndExport()
    db.closeDatabase()
    db.initDatabase(':memory:')

    const result = applyImport(exported)

    expect(result).toEqual({ shelves: 2, files: 3 })
    const shelves = db.listShelves()
    expect(shelves.map((s) => s.name)).toEqual(['Work', 'Personal', 'Temporary', 'Invoices'])
    const work = shelves[0]
    const workFiles = db.listFiles(work.id)
    expect(workFiles.map((f) => [f.name, f.isPinned])).toEqual([
      ['a.txt', true],
      ['b.txt', false]
    ])
    const settings = db.getSettings()
    expect(settings.theme).toBe('light')
    expect(settings.fileSort).toBe('name')
    // Machine-specific settings are not carried over.
    expect(settings.openHotkey).toBe('CommandOrControl+Shift+Space')
  })

  it('merges into existing shelves by name and skips duplicates', () => {
    const exported = seedAndExport()
    const again = applyImport(exported)
    expect(again.files).toBe(0)
    expect(db.listShelves().filter((s) => s.name === 'Invoices')).toHaveLength(1)
  })

  it('rejects files that are not Stash exports and changes nothing', () => {
    expect(() => applyImport({ hello: 'world' })).toThrow(InvalidExportError)
    expect(() => applyImport({ ...(seedAndExport() as object), version: 99 })).toThrow(
      InvalidExportError
    )
    const bad = seedAndExport() as { files: { absolutePath: unknown }[] }
    bad.files[0].absolutePath = 42
    const before = db.listFiles(null).length
    expect(() => applyImport(bad)).toThrow(InvalidExportError)
    expect(db.listFiles(null)).toHaveLength(before)
  })
})
