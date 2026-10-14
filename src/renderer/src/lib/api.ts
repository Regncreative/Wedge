import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type {
  AddFilesResult,
  AppSettings,
  Shelf,
  ShelfStats,
  StashFile,
  UpdateStatus
} from '@shared/types'

type OpResult = { ok: boolean; error?: string }

export type FileDropEvent =
  | { type: 'enter'; paths: string[] }
  | { type: 'over' }
  | { type: 'drop'; paths: string[] }
  | { type: 'leave' }

/**
 * Bridge between the React panel and the Rust backend (src-tauri). Exposed as
 * `window.stash` so components don't depend on Tauri directly; every call maps
 * to a #[tauri::command] in src-tauri/src/commands.rs.
 */
export interface StashApi {
  // Window
  hideWindow: () => Promise<void>
  setPinned: (pinned: boolean) => Promise<boolean>
  isPinned: () => Promise<boolean>
  /** Fades the panel (the window is transparent, so this is pure CSS). */
  setOpacity: (opacity: number, animate?: boolean) => Promise<boolean>

  // Files
  listFiles: (shelfId?: string | null) => Promise<StashFile[]>
  addFiles: (paths: string[], shelfId?: string | null) => Promise<AddFilesResult>
  removeFile: (id: string) => Promise<boolean>
  removeFiles: (ids: string[]) => Promise<boolean>
  clearMissingFiles: () => Promise<number>
  pinFile: (id: string, pinned: boolean) => Promise<boolean>
  pinFiles: (ids: string[], pinned: boolean) => Promise<boolean>
  moveFile: (id: string, shelfId: string) => Promise<boolean>
  openFile: (id: string) => Promise<OpResult>
  revealFile: (id: string) => Promise<OpResult>
  copyPath: (id: string) => Promise<boolean>
  getProperties: (id: string) => Promise<OpResult>
  getFileIcon: (id: string) => Promise<string | null>
  /** Thumbnail (PNG data URL) for image files, rendered by Windows. */
  getPreview: (id: string) => Promise<string | null>
  /** Native drag into other apps; resolves when the drag ends. */
  startDrag: (ids: string[]) => Promise<void>

  // Shelves
  listShelves: () => Promise<Shelf[]>
  createShelf: (input: { name: string; icon?: string; color?: string }) => Promise<Shelf>
  renameShelf: (id: string, name: string) => Promise<boolean>
  deleteShelf: (id: string) => Promise<boolean>

  // Stats & settings
  getStats: () => Promise<ShelfStats>
  getSettings: () => Promise<AppSettings>
  setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  getSystemTheme: () => Promise<'light' | 'dark'>
  getAppVersion: () => Promise<string>
  openReleases: () => Promise<boolean>
  openLogsFolder: () => Promise<string>
  exportData: () => Promise<{ ok: boolean; canceled?: boolean }>
  importData: () => Promise<
    { ok: true; shelves: number; files: number } | { ok: false; canceled: boolean }
  >

  // Updates
  checkForUpdates: () => Promise<UpdateStatus>
  installUpdate: () => Promise<boolean>
  getUpdateStatus: () => Promise<UpdateStatus>

  // Events
  onFileDrop: (cb: (event: FileDropEvent) => void) => () => void
  onThemeChanged: (cb: (theme: 'light' | 'dark') => void) => () => void
  onNavigateSettings: (cb: () => void) => () => void
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  onPanelShown: (cb: () => void) => () => void
  onPanelHidden: (cb: () => void) => () => void
}

/** Wrap an async Tauri subscription in the synchronous `() => unsubscribe` shape. */
function subscribe(start: () => Promise<UnlistenFn>): () => void {
  let unlisten: UnlistenFn | null = null
  let cancelled = false
  void start().then((fn) => {
    if (cancelled) fn()
    else unlisten = fn
  })
  return () => {
    cancelled = true
    unlisten?.()
  }
}

function onEvent<T>(name: string, cb: (payload: T) => void): () => void {
  return subscribe(() => listen<T>(name, (e) => cb(e.payload)))
}

function setPanelOpacity(opacity: number, animate = true): Promise<boolean> {
  const root = document.documentElement
  root.style.setProperty('--panel-fade', animate ? '480ms' : '0ms')
  root.style.setProperty('--panel-opacity', String(Math.min(1, Math.max(0.1, opacity))))
  return Promise.resolve(true)
}

export const api: StashApi = {
  hideWindow: () => invoke('hide_panel'),
  setPinned: (pinned) => invoke('set_pinned', { pinned }),
  isPinned: () => invoke('is_pinned'),
  setOpacity: setPanelOpacity,

  listFiles: (shelfId) => invoke('list_files', { shelfId: shelfId ?? null }),
  addFiles: (paths, shelfId) => invoke('add_files', { paths, shelfId: shelfId ?? null }),
  removeFile: (id) => invoke('remove_files', { ids: [id] }),
  removeFiles: (ids) => invoke('remove_files', { ids }),
  clearMissingFiles: () => invoke('clear_missing_files'),
  pinFile: (id, pinned) => invoke('pin_files', { ids: [id], pinned }),
  pinFiles: (ids, pinned) => invoke('pin_files', { ids, pinned }),
  moveFile: (id, shelfId) => invoke('move_file', { id, shelfId }),
  openFile: (id) => invoke('open_file', { id }),
  revealFile: (id) => invoke('reveal_file', { id }),
  copyPath: (id) => invoke('copy_path', { id }),
  getProperties: (id) => invoke('show_properties', { id }),
  getFileIcon: (id) => invoke('file_icon', { id }),
  getPreview: (id) => invoke('file_preview', { id }),
  startDrag: (ids) => invoke('start_drag', { ids }),

  listShelves: () => invoke('list_shelves'),
  createShelf: (input) => invoke('create_shelf', { input }),
  renameShelf: (id, name) => invoke('rename_shelf', { id, name }),
  deleteShelf: (id) => invoke('delete_shelf', { id }),

  getStats: () => invoke('get_stats'),
  getSettings: () => invoke('get_settings'),
  setSettings: (partial) => invoke('set_settings', { patch: partial }),
  getSystemTheme: async () => ((await getCurrentWindow().theme()) === 'light' ? 'light' : 'dark'),
  getAppVersion: () => invoke('app_version'),
  openReleases: () => invoke('open_releases'),
  openLogsFolder: () => invoke('open_logs_folder'),
  exportData: () => invoke('export_data'),
  importData: () => invoke('import_data'),

  checkForUpdates: () => invoke('check_for_updates'),
  installUpdate: () => invoke('install_update'),
  getUpdateStatus: () => invoke('update_status'),

  onFileDrop: (cb) =>
    subscribe(() =>
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'enter') cb({ type: 'enter', paths: payload.paths })
        else if (payload.type === 'over') cb({ type: 'over' })
        else if (payload.type === 'drop') cb({ type: 'drop', paths: payload.paths })
        else cb({ type: 'leave' })
      })
    ),
  onThemeChanged: (cb) =>
    subscribe(() =>
      getCurrentWindow().onThemeChanged(({ payload }) => cb(payload === 'light' ? 'light' : 'dark'))
    ),
  onNavigateSettings: (cb) => onEvent('navigate-settings', cb),
  onUpdateStatus: (cb) => onEvent<UpdateStatus>('update-status', cb),
  onPanelShown: (cb) => onEvent('panel-shown', cb),
  onPanelHidden: (cb) => onEvent('panel-hidden', cb)
}
