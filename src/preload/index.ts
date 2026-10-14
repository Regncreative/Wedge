import { contextBridge, ipcRenderer, webUtils, IpcRendererEvent } from 'electron'
import { IpcChannels } from '../shared/ipc'
import type {
  AddFilesResult,
  AppSettings,
  FileFilter,
  Shelf,
  ShelfStats,
  StashFile,
  UpdateStatus
} from '../shared/types'

export type { UpdateStatus }

export interface StashApi {
  // Window
  hideWindow: () => Promise<void>
  setPinned: (pinned: boolean) => Promise<boolean>
  isPinned: () => Promise<boolean>
  setOpacity: (opacity: number, animate?: boolean) => Promise<boolean>

  // Files
  listFiles: (shelfId?: string | null) => Promise<StashFile[]>
  addFiles: (paths: string[], shelfId?: string) => Promise<AddFilesResult>
  removeFile: (id: string) => Promise<boolean>
  clearMissingFiles: () => Promise<number>
  pinFile: (id: string, pinned: boolean) => Promise<boolean>
  moveFile: (id: string, shelfId: string) => Promise<boolean>
  openFile: (id: string) => Promise<{ ok: boolean; error?: string }>
  revealFile: (id: string) => Promise<{ ok: boolean; error?: string }>
  copyPath: (id: string) => Promise<boolean>
  getProperties: (id: string) => Promise<{ ok: boolean; error?: string }>
  getFileIcon: (id: string) => Promise<string | null>
  startDrag: (id: string) => void
  getPathForFile: (file: File) => string

  // Shelves
  listShelves: () => Promise<Shelf[]>
  createShelf: (input: { name: string; icon?: string; color?: string }) => Promise<Shelf>
  renameShelf: (id: string, name: string) => Promise<boolean>
  deleteShelf: (id: string) => Promise<boolean>
  updateShelf: (
    id: string,
    updates: Partial<{ name: string; icon: string; color: string; sortOrder: number }>
  ) => Promise<boolean>

  // Stats & settings
  getStats: () => Promise<ShelfStats>
  getSettings: () => Promise<AppSettings>
  setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  getSystemTheme: () => Promise<'light' | 'dark'>
  notify: (title: string, body: string) => Promise<void>
  getAppVersion: () => Promise<string>
  openReleases: () => Promise<boolean>
  openLogsFolder: () => Promise<string>

  // Updates
  checkForUpdates: () => Promise<UpdateStatus>
  installUpdate: () => Promise<boolean>
  getUpdateStatus: () => Promise<UpdateStatus>

  // Events
  onThemeChanged: (cb: (theme: 'light' | 'dark') => void) => () => void
  onNavigateSettings: (cb: () => void) => () => void
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  onPanelShown: (cb: () => void) => () => void
  onPanelHidden: (cb: () => void) => () => void
}

const api: StashApi = {
  hideWindow: () => ipcRenderer.invoke(IpcChannels.WINDOW_HIDE),
  setPinned: (pinned) => ipcRenderer.invoke(IpcChannels.WINDOW_PIN, pinned),
  isPinned: () => ipcRenderer.invoke(IpcChannels.WINDOW_IS_PINNED),
  setOpacity: (opacity, animate) =>
    ipcRenderer.invoke(IpcChannels.WINDOW_SET_OPACITY, opacity, animate !== false),

  listFiles: (shelfId) => ipcRenderer.invoke(IpcChannels.FILES_LIST, shelfId),
  addFiles: (paths, shelfId) => ipcRenderer.invoke(IpcChannels.FILES_ADD, paths, shelfId),
  removeFile: (id) => ipcRenderer.invoke(IpcChannels.FILES_REMOVE, id),
  clearMissingFiles: () => ipcRenderer.invoke(IpcChannels.FILES_CLEAR_MISSING),
  pinFile: (id, pinned) => ipcRenderer.invoke(IpcChannels.FILES_PIN, id, pinned),
  moveFile: (id, shelfId) => ipcRenderer.invoke(IpcChannels.FILES_MOVE, id, shelfId),
  openFile: (id) => ipcRenderer.invoke(IpcChannels.FILES_OPEN, id),
  revealFile: (id) => ipcRenderer.invoke(IpcChannels.FILES_REVEAL, id),
  copyPath: (id) => ipcRenderer.invoke(IpcChannels.FILES_COPY_PATH, id),
  getProperties: (id) => ipcRenderer.invoke(IpcChannels.FILES_PROPERTIES, id),
  getFileIcon: (id) => ipcRenderer.invoke(IpcChannels.FILES_ICON, id),
  startDrag: (id) => ipcRenderer.send(IpcChannels.FILES_START_DRAG, id),
  getPathForFile: (file) => webUtils.getPathForFile(file),

  listShelves: () => ipcRenderer.invoke(IpcChannels.SHELVES_LIST),
  createShelf: (input) => ipcRenderer.invoke(IpcChannels.SHELVES_CREATE, input),
  renameShelf: (id, name) => ipcRenderer.invoke(IpcChannels.SHELVES_RENAME, id, name),
  deleteShelf: (id) => ipcRenderer.invoke(IpcChannels.SHELVES_DELETE, id),
  updateShelf: (id, updates) => ipcRenderer.invoke(IpcChannels.SHELVES_UPDATE, id, updates),

  getStats: () => ipcRenderer.invoke(IpcChannels.STATS_GET),
  getSettings: () => ipcRenderer.invoke(IpcChannels.SETTINGS_GET),
  setSettings: (partial) => ipcRenderer.invoke(IpcChannels.SETTINGS_SET, partial),
  getSystemTheme: () => ipcRenderer.invoke(IpcChannels.THEME_GET),
  notify: (title, body) => ipcRenderer.invoke(IpcChannels.NOTIFY, title, body),
  getAppVersion: () => ipcRenderer.invoke(IpcChannels.APP_GET_VERSION),
  openReleases: () => ipcRenderer.invoke(IpcChannels.OPEN_RELEASES),
  openLogsFolder: () => ipcRenderer.invoke(IpcChannels.OPEN_LOGS),

  checkForUpdates: () => ipcRenderer.invoke(IpcChannels.UPDATE_CHECK),
  installUpdate: () => ipcRenderer.invoke(IpcChannels.UPDATE_INSTALL),
  getUpdateStatus: () => ipcRenderer.invoke(IpcChannels.UPDATE_GET_STATUS),

  onThemeChanged: (cb) => {
    const handler = (_: IpcRendererEvent, theme: 'light' | 'dark') => cb(theme)
    ipcRenderer.on(IpcChannels.THEME_CHANGED, handler)
    return () => ipcRenderer.removeListener(IpcChannels.THEME_CHANGED, handler)
  },
  onNavigateSettings: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('navigate:settings', handler)
    return () => ipcRenderer.removeListener('navigate:settings', handler)
  },
  onUpdateStatus: (cb) => {
    const handler = (_: IpcRendererEvent, status: UpdateStatus) => cb(status)
    ipcRenderer.on(IpcChannels.UPDATE_STATUS, handler)
    return () => ipcRenderer.removeListener(IpcChannels.UPDATE_STATUS, handler)
  },
  onPanelShown: (cb) => {
    const handler = () => cb()
    ipcRenderer.on(IpcChannels.WINDOW_SHOWN, handler)
    return () => ipcRenderer.removeListener(IpcChannels.WINDOW_SHOWN, handler)
  },
  onPanelHidden: (cb) => {
    const handler = () => cb()
    ipcRenderer.on(IpcChannels.WINDOW_HIDE, handler)
    return () => ipcRenderer.removeListener(IpcChannels.WINDOW_HIDE, handler)
  }
}

contextBridge.exposeInMainWorld('stash', api)

// Re-export filter type for consumers
export type { FileFilter }
