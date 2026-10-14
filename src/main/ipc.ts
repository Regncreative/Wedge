import { ipcMain, shell, clipboard, Notification, nativeImage, app, NativeImage } from 'electron'
import { existsSync } from 'fs'
import { stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import koffi from 'koffi'
import { IpcChannels } from '../shared/ipc'
import * as db from './database'
import { getPanelWindow, beginExternalDialog } from './window'
import { syncAutoLaunch } from './auto-launch'
import { reregisterHotkey } from './hotkey'
import { checkForUpdates, getUpdateStatus, installUpdateNow } from './updater'
import { checkPath, isReachable } from './file-exists'
import { getMessages } from '../shared/i18n'
import type { FileInput } from './database'
import type { AppSettings } from '../shared/types'

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
  beginExternalDialog()
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
  ipcMain.handle(IpcChannels.FILES_LIST, (_e, shelfId?: string | null) => {
    return Promise.all(db.listFiles(shelfId).map(enrichExists))
  })

  ipcMain.handle(IpcChannels.FILES_SEARCH, (_e, query: string, shelfId?: string | null) => {
    return Promise.all(db.searchFiles(query, shelfId).map(enrichExists))
  })

  ipcMain.handle(
    IpcChannels.FILES_ADD,
    async (_e, paths: string[], shelfId?: string) => {
      const settings = db.getSettings()
      const targetShelfId = shelfId || settings.defaultShelfId || db.listShelves()[0]?.id
      if (!targetShelfId) throw new Error('No shelf available')

      const metas = (await Promise.all(paths.map(collectFileMeta))).filter(
        (meta): meta is FileInput => meta !== null
      )

      const result = db.addFiles(metas, targetShelfId)
      const shelf = db.listShelves().find((s) => s.id === targetShelfId)

      if (result.added > 0 && settings.notifications) {
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

      const payload = {
        added: result.added,
        skipped: result.skipped,
        shelfId: targetShelfId,
        shelfName: shelf?.name ?? ''
      }

      getPanelWindow()?.webContents.send(IpcChannels.FILES_ADDED_EVENT, payload)
      return payload
    }
  )

  ipcMain.handle(IpcChannels.FILES_REMOVE, (_e, id: string) => {
    db.removeFile(id)
    return true
  })

  ipcMain.handle(IpcChannels.FILES_CLEAR_MISSING, async () => {
    const all = db.listFiles(null)
    const states = await Promise.all(all.map((file) => checkPath(file.absolutePath)))
    // Only drop confirmed-missing files; an unreachable network share (null)
    // may come back, so its references are kept.
    const missingIds = all.filter((_, i) => states[i] === false).map((file) => file.id)
    db.removeFiles(missingIds)
    return missingIds.length
  })

  ipcMain.handle(IpcChannels.FILES_PIN, (_e, id: string, pinned: boolean) => {
    db.setFilePinned(id, pinned)
    return true
  })

  ipcMain.handle(IpcChannels.FILES_MOVE, (_e, id: string, shelfId: string) => {
    db.moveFile(id, shelfId)
    return true
  })

  ipcMain.handle(IpcChannels.FILES_OPEN, async (_e, id: string) => {
    const file = db.getFileById(id)
    if (!file) return { ok: false, error: 'not_found' }
    if (!(await isReachable(file.absolutePath))) return { ok: false, error: 'missing' }
    db.touchFileAccessed(id)
    const err = await shell.openPath(file.absolutePath)
    return err ? { ok: false, error: err } : { ok: true }
  })

  ipcMain.handle(IpcChannels.FILES_REVEAL, async (_e, id: string) => {
    const file = db.getFileById(id)
    if (!file) return { ok: false, error: 'not_found' }
    if (!(await isReachable(file.absolutePath))) return { ok: false, error: 'missing' }
    shell.showItemInFolder(file.absolutePath)
    return { ok: true }
  })

  ipcMain.handle(IpcChannels.FILES_COPY_PATH, (_e, id: string) => {
    const file = db.getFileById(id)
    if (!file) return false
    clipboard.writeText(file.absolutePath)
    return true
  })

  ipcMain.handle(IpcChannels.FILES_ICON, async (_e, id: string) => {
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

  ipcMain.handle(IpcChannels.FILES_PROPERTIES, async (_e, id: string) => {
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

  ipcMain.handle(IpcChannels.FILES_CHECK_EXISTS, (_e, id: string) => {
    const file = db.getFileById(id)
    if (!file) return false
    return isReachable(file.absolutePath)
  })

  ipcMain.on(IpcChannels.FILES_START_DRAG, (event, id: string) => {
    const file = db.getFileById(id)
    if (!file || !existsSync(file.absolutePath)) return

    db.touchFileAccessed(id)

    try {
      event.sender.startDrag({
        file: file.absolutePath,
        icon: getDragIcon(file.absolutePath)
      })
    } catch (err) {
      console.error('startDrag failed:', err)
    }
  })

  // ── Shelves ────────────────────────────────────────────
  ipcMain.handle(IpcChannels.SHELVES_LIST, () => db.listShelves())

  ipcMain.handle(
    IpcChannels.SHELVES_CREATE,
    (_e, input: { name: string; icon?: string; color?: string }) => {
      return db.createShelf(input)
    }
  )

  ipcMain.handle(IpcChannels.SHELVES_RENAME, (_e, id: string, name: string) => {
    db.renameShelf(id, name)
    return true
  })

  ipcMain.handle(IpcChannels.SHELVES_DELETE, (_e, id: string) => {
    db.deleteShelf(id)
    return true
  })

  ipcMain.handle(
    IpcChannels.SHELVES_UPDATE,
    (
      _e,
      id: string,
      updates: Partial<{ name: string; icon: string; color: string; sortOrder: number }>
    ) => {
      db.updateShelf(id, updates)
      return true
    }
  )

  // ── Stats ──────────────────────────────────────────────
  ipcMain.handle(IpcChannels.STATS_GET, () => db.getStats())

  // ── Settings ───────────────────────────────────────────
  ipcMain.handle(IpcChannels.SETTINGS_GET, () => db.getSettings())

  ipcMain.handle(IpcChannels.SETTINGS_SET, (_e, partial: Partial<AppSettings>) => {
    const next = db.setSettings(partial)
    if (partial.startWithWindows !== undefined) {
      syncAutoLaunch(partial.startWithWindows)
    }
    if (partial.openHotkey !== undefined) {
      reregisterHotkey(next.openHotkey)
    }
    return next
  })

  ipcMain.handle(IpcChannels.NOTIFY, (_e, title: string, body: string) => {
    if (!db.getSettings().notifications) return
    try {
      new Notification({ title, body }).show()
    } catch {
      // ignore
    }
  })

  ipcMain.handle(IpcChannels.APP_GET_VERSION, () => app.getVersion())
  ipcMain.handle(IpcChannels.OPEN_RELEASES, () => {
    void shell.openExternal('https://github.com/Regncreative/Stash/releases/latest')
    return true
  })

  ipcMain.handle(IpcChannels.UPDATE_CHECK, () => checkForUpdates(true))
  ipcMain.handle(IpcChannels.UPDATE_INSTALL, () => {
    installUpdateNow()
    return true
  })
  ipcMain.handle(IpcChannels.UPDATE_GET_STATUS, () => getUpdateStatus())
}

async function enrichExists<T extends { absolutePath: string; exists?: boolean }>(
  file: T
): Promise<T> {
  return { ...file, exists: await isReachable(file.absolutePath) }
}