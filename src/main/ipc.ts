import { shell, clipboard, dialog, Notification, nativeImage, app, NativeImage } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { z } from 'zod'
import { existsSync } from 'fs'
import { stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import koffi from 'koffi'
import { IpcChannels } from '../shared/ipc'
import * as db from './database'
import { getPanelWindow } from './window'
import { syncAutoLaunch } from './auto-launch'
import { reregisterHotkey } from './hotkey'
import { applyUpdateChannel, checkForUpdates, getUpdateStatus, installUpdateNow } from './updater'
import { checkPath, isReachable } from './file-exists'
import { handle, on } from './ipc-validate'
import { openLogsFolder } from './logging'
import { applyImport, buildExport } from './data-transfer'
import * as v from './ipc-schemas'
import { getMessages } from '../shared/i18n'
import type { FileInput } from './database'

/** SEE_MASK_INVOKEIDLIST — required for the "properties" verb. */
const SEE_MASK_INVOKEIDLIST = 0x0000000c
const SW_SHOW = 5

const SHELLEXECUTEINFOW = koffi.struct('SHELLEXECUTEINFOW', {
  cbSize: 'uint32',
  fMask: 'uint32',
  hwnd: 'void *',
  lpVerb: 'str16',
  lpFile: 'str16',
  lpParameters: 'str16',
  lpDirectory: 'str16',
  nShow: 'int',
  hInstApp: 'void *',
  lpIDList: 'void *',
  lpClass: 'str16',
  hkeyClass: 'void *',
  dwHotKey: 'uint32',
  hIcon: 'void *',
  hProcess: 'void *'
})

const ShellExecuteExW = koffi
  .load('shell32.dll')
  .func('bool __stdcall ShellExecuteExW(_Inout_ SHELLEXECUTEINFOW *pExecInfo)')

/** Windows requires a non-empty drag icon or startDrag silently fails. */
function getDragIcon(filePath: string): NativeImage {
  // Prefer a thumbnail when the file itself is an image
  try {
    const fromFile = nativeImage.createFromPath(filePath)
    if (!fromFile.isEmpty() && fromFile.getSize().width > 0) {
      return fromFile.resize({ width: 64, height: 64, quality: 'better' })
    }
  } catch {
    // fall through
  }

  // App tray / resource icon
  const candidates = [
    join(__dirname, '../../resources/tray-icon.png'),
    join(app.getAppPath(), 'resources/tray-icon.png'),
    join(process.resourcesPath ?? '', 'tray-icon.png')
  ]
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img.resize({ width: 32, height: 32 })
    } catch {
      // try next
    }
  }

  // Programmatic 32×32 blue square fallback (always valid on Windows)
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1
      buf[i] = edge ? 30 : 37
      buf[i + 1] = edge ? 80 : 99
      buf[i + 2] = edge ? 200 : 235
      buf[i + 3] = 255
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

/** Cache system file icons by absolute path (dataURL or null). */
const iconCache = new Map<string, string | null>()

/**
 * Opens the native Windows file properties dialog via ShellExecuteEx —
 * no PowerShell / WScript helper process (avoids scary taskbar icons).
 */
function openNativeProperties(filePath: string): boolean {
  const panel = getPanelWindow()
  if (panel && !panel.isDestroyed()) {
    panel.setAlwaysOnTop(false)
  }

  // hwnd=null matches Explorer: standalone properties sheet, no extra taskbar icon.
  const info = {
    cbSize: koffi.sizeof(SHELLEXECUTEINFOW),
    fMask: SEE_MASK_INVOKEIDLIST,
    hwnd: null,
    lpVerb: 'properties',
    lpFile: filePath,
    lpParameters: null,
    lpDirectory: null,
    nShow: SW_SHOW,
    hInstApp: null,
    lpIDList: null,
    lpClass: null,
    hkeyClass: null,
    dwHotKey: 0,
    hIcon: null,
    hProcess: null
  }

  const ok = ShellExecuteExW(info)
  if (!ok) {
    console.error('[stash] ShellExecuteEx(properties) failed for', filePath)
  }

  // Restore alwaysOnTop when the user focuses Stash again (dialog stays usable).
  if (panel && !panel.isDestroyed()) {
    const restore = (): void => {
      if (!panel.isDestroyed()) panel.setAlwaysOnTop(true, 'pop-up-menu')
      panel.removeListener('focus', restore)
    }
    panel.once('focus', restore)
    setTimeout(restore, 10 * 60 * 1000)
  }

  return ok
}

async function collectFileMeta(filePath: string): Promise<FileInput | null> {
  try {
    const stats = await stat(filePath)
    const name = basename(filePath)
    const extension = stats.isDirectory() ? '' : extname(filePath).replace(/^\./, '').toLowerCase()
    return {
      absolutePath: filePath,
      name,
      extension,
      size: stats.isDirectory() ? 0 : stats.size,
      isDirectory: stats.isDirectory(),
      createdAt: Math.floor(stats.birthtimeMs) || Math.floor(stats.ctimeMs)
    }
  } catch {
    return null
  }
}

export function registerIpcHandlers(): void {
  // ── Files ──────────────────────────────────────────────
  handle(IpcChannels.FILES_LIST, [v.optionalShelfId], (shelfId) => {
    return Promise.all(db.listFiles(shelfId).map(enrichExists))
  })

  handle(
    IpcChannels.FILES_ADD,
    [v.filePaths, v.optionalShelfId],
    async (paths, shelfId) => {
      const settings = db.getSettings()
      const targetShelfId = shelfId || settings.defaultShelfId || db.listShelves()[0]?.id
      if (!targetShelfId) throw new Error('No shelf available')

      const metas = (await Promise.all(paths.map(collectFileMeta))).filter(
        (meta): meta is FileInput => meta !== null
      )

      const result = db.addFiles(metas, targetShelfId)
      const shelf = db.listShelves().find((s) => s.id === targetShelfId)

      // Drops land on the open panel, which already shows a toast; only
      // notify when files arrive while the panel is hidden.
      const panelVisible = getPanelWindow()?.isVisible() ?? false
      if (result.added > 0 && settings.notifications && !panelVisible) {
        try {
          const t = getMessages(settings.language)
          new Notification({
            title: 'Stash',
            body: t.filesAdded(result.added, shelf?.name ?? ''),
            silent: false
          }).show()
        } catch {
          // notifications may be unavailable
        }
      }

      return {
        added: result.added,
        skipped: result.skipped,
        shelfId: targetShelfId,
        shelfName: shelf?.name ?? ''
      }
    }
  )

  handle(IpcChannels.FILES_REMOVE, [v.id], (id) => {
    db.removeFile(id)
    return true
  })

  handle(IpcChannels.FILES_REMOVE_MANY, [v.fileIds], (ids) => {
    db.removeFiles(ids)
    return true
  })

  handle(IpcChannels.FILES_CLEAR_MISSING, [], async () => {
    const all = db.listFiles(null)
    const states = await Promise.all(all.map((file) => checkPath(file.absolutePath)))
    // Only drop confirmed-missing files; an unreachable network share (null)
    // may come back, so its references are kept.
    const missingIds = all.filter((_, i) => states[i] === false).map((file) => file.id)
    db.removeFiles(missingIds)
    return missingIds.length
  })

  handle(IpcChannels.FILES_PIN, [v.id, z.boolean()], (id, pinned) => {
    db.setFilePinned(id, pinned)
    return true
  })

  handle(IpcChannels.FILES_PIN_MANY, [v.fileIds, z.boolean()], (ids, pinned) => {
    db.setFilesPinned(ids, pinned)
    return true
  })

  handle(IpcChannels.FILES_MOVE, [v.id, v.id], (id, shelfId) => {
    db.moveFile(id, shelfId)
    return true
  })

  handle(IpcChannels.FILES_OPEN, [v.id], async (id) => {
    const file = db.getFileById(id)
    if (!file) return { ok: false, error: 'not_found' }
    if (!(await isReachable(file.absolutePath))) return { ok: false, error: 'missing' }
    db.touchFileAccessed(id)
    const err = await shell.openPath(file.absolutePath)
    return err ? { ok: false, error: err } : { ok: true }
  })

  handle(IpcChannels.FILES_REVEAL, [v.id], async (id) => {
    const file = db.getFileById(id)
    if (!file) return { ok: false, error: 'not_found' }
    if (!(await isReachable(file.absolutePath))) return { ok: false, error: 'missing' }
    shell.showItemInFolder(file.absolutePath)
    return { ok: true }
  })

  handle(IpcChannels.FILES_COPY_PATH, [v.id], (id) => {
    const file = db.getFileById(id)
    if (!file) return false
    clipboard.writeText(file.absolutePath)
    return true
  })

  handle(IpcChannels.FILES_ICON, [v.id], async (id) => {
    const file = db.getFileById(id)
    if (!file || file.isDirectory || !(await isReachable(file.absolutePath))) return null

    const cached = iconCache.get(file.absolutePath)
    if (cached !== undefined) return cached

    try {
      // .lnk shortcuts return a generic page icon; resolve the target and
      // use the real application's icon instead.
      let iconPath = file.absolutePath
      if (file.extension.toLowerCase() === 'lnk') {
        try {
          const link = shell.readShortcutLink(file.absolutePath)
          if (link.target && (await isReachable(link.target))) iconPath = link.target
        } catch {
          // keep the .lnk itself as icon source
        }
      }

      const img = await app.getFileIcon(iconPath, { size: 'large' })
      const url = img.isEmpty() ? null : img.toDataURL()
      iconCache.set(file.absolutePath, url)
      return url
    } catch {
      iconCache.set(file.absolutePath, null)
      return null
    }
  })

  handle(IpcChannels.FILES_PROPERTIES, [v.id], async (id) => {
    const file = db.getFileById(id)
    if (!file) return { ok: false, error: 'not_found' }
    if (!(await isReachable(file.absolutePath))) return { ok: false, error: 'missing' }
    try {
      const ok = openNativeProperties(file.absolutePath)
      return ok ? { ok: true } : { ok: false, error: 'failed' }
    } catch (err) {
      console.error('[stash] openNativeProperties failed', err)
      return { ok: false, error: 'failed' }
    }
  })

  // Drag must start synchronously while the mouse button is still down, so
  // this uses existsSync; the renderer only offers files it saw as reachable.
  on(IpcChannels.FILES_START_DRAG, [v.fileIds], (event, ids) => {
    const files = ids
      .map((id) => db.getFileById(id))
      .filter((f): f is NonNullable<typeof f> => f !== null && existsSync(f.absolutePath))
    if (files.length === 0) return

    for (const file of files) db.touchFileAccessed(file.id)

    const paths = files.map((f) => f.absolutePath)
    try {
      event.sender.startDrag({
        file: paths[0],
        files: paths,
        icon: getDragIcon(paths[0])
      })
    } catch (err) {
      console.error('startDrag failed:', err)
    }
  })

  // ── Shelves ────────────────────────────────────────────
  handle(IpcChannels.SHELVES_LIST, [], () => db.listShelves())

  handle(IpcChannels.SHELVES_CREATE, [v.shelfInput], (input) => db.createShelf(input))

  handle(IpcChannels.SHELVES_RENAME, [v.id, v.shelfInput.shape.name], (id, name) => {
    db.renameShelf(id, name)
    return true
  })

  handle(IpcChannels.SHELVES_DELETE, [v.id], (id) => {
    db.deleteShelf(id)
    return true
  })

  handle(IpcChannels.SHELVES_UPDATE, [v.id, v.shelfUpdates], (id, updates) => {
    db.updateShelf(id, updates)
    return true
  })

  // ── Stats ──────────────────────────────────────────────
  handle(IpcChannels.STATS_GET, [], () => db.getStats())

  // ── Settings ───────────────────────────────────────────
  handle(IpcChannels.SETTINGS_GET, [], () => db.getSettings())

  handle(IpcChannels.SETTINGS_SET, [v.settingsPatch], (partial) => {
    // Register first: an unavailable hotkey must not be persisted.
    if (partial.openHotkey !== undefined && !reregisterHotkey(partial.openHotkey)) {
      throw new Error('hotkey_unavailable')
    }
    const next = db.setSettings(partial)
    if (partial.startWithWindows !== undefined) {
      syncAutoLaunch(partial.startWithWindows)
    }
    if (partial.updateChannel !== undefined) {
      applyUpdateChannel(next.updateChannel)
    }
    return next
  })

  handle(IpcChannels.NOTIFY, [v.shortText, v.shortText], (title, body) => {
    if (!db.getSettings().notifications) return
    try {
      new Notification({ title, body }).show()
    } catch {
      // ignore
    }
  })

  handle(IpcChannels.APP_GET_VERSION, [], () => app.getVersion())
  handle(IpcChannels.OPEN_RELEASES, [], () => {
    void shell.openExternal('https://github.com/Regncreative/Stash/releases/latest')
    return true
  })

  handle(IpcChannels.OPEN_LOGS, [], () => openLogsFolder())

  handle(IpcChannels.DATA_EXPORT, [], async () => {
    const panel = getPanelWindow()
    const stamp = new Date().toISOString().slice(0, 10)
    const options = {
      defaultPath: join(app.getPath('documents'), `stash-backup-${stamp}.json`),
      filters: [{ name: 'Stash backup', extensions: ['json'] }]
    }
    const { canceled, filePath } = panel
      ? await dialog.showSaveDialog(panel, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return { ok: false, canceled: true }
    await writeFile(filePath, JSON.stringify(buildExport(), null, 2), 'utf8')
    return { ok: true }
  })

  handle(IpcChannels.DATA_IMPORT, [], async () => {
    const panel = getPanelWindow()
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'Stash backup', extensions: ['json'] }]
    }
    const { canceled, filePaths } = panel
      ? await dialog.showOpenDialog(panel, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
    try {
      const raw: unknown = JSON.parse(await readFile(filePaths[0], 'utf8'))
      return { ok: true, ...applyImport(raw) }
    } catch (err) {
      console.warn('[stash] import failed', err)
      return { ok: false, canceled: false }
    }
  })

  handle(IpcChannels.UPDATE_CHECK, [], () => checkForUpdates(true))
  handle(IpcChannels.UPDATE_INSTALL, [], () => {
    installUpdateNow()
    return true
  })
  handle(IpcChannels.UPDATE_GET_STATUS, [], () => getUpdateStatus())
}

async function enrichExists<T extends { absolutePath: string; exists?: boolean }>(
  file: T
): Promise<T> {
  return { ...file, exists: await isReachable(file.absolutePath) }
}