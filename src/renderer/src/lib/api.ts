import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type {
  AddFilesResult,
  AppSettings,
  FilesChanged,
  PhoneSession,
  Preview,
  Rule,
  Shelf,
  ShelfStats,
  StashFile,
  SyncDevice,
  UpdateStatus
} from '@shared/types'

export type ImageFormat = 'jpg' | 'png' | 'webp'

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

  // Notes, reminders, search
  setNote: (id: string, note: string, tags: string) => Promise<boolean>
  setReminder: (id: string, at: number | null) => Promise<boolean>
  /** Ids of files whose contents match the query. */
  searchContent: (query: string) => Promise<string[]>
  /** Tells the backend what is selected (for the paste-into-dialog shortcut). */
  setSelection: (ids: string[]) => Promise<void>
  quickLook: (id: string) => Promise<Preview>

  // Quick actions
  zipFiles: (ids: string[]) => Promise<{ ok: boolean; path?: string }>
  convertImages: (
    ids: string[],
    format: ImageFormat,
    maxSide?: number | null
  ) => Promise<{ converted: number; failed: number }>
  collectFiles: (ids: string[]) => Promise<{ ok: boolean; canceled?: boolean; copied?: number }>
  copyPaths: (ids: string[]) => Promise<number>
  openFiles: (ids: string[]) => Promise<number>
  /** Zip the files to a temporary archive and drag it out; resolves when the drag ends. */
  startDragZip: (ids: string[], name: string) => Promise<void>
  pasteClipboard: (
    shelfId?: string | null
  ) => Promise<{ kind: 'files' | 'image' | 'link' | 'text' | 'empty'; added: number }>

  // Shelves
  listShelves: () => Promise<Shelf[]>
  setShelfExpiry: (id: string, hours: number | null) => Promise<boolean>
  listRules: () => Promise<Rule[]>
  addRule: (shelfId: string, extensions: string, source: Rule['source']) => Promise<Rule>
  deleteRule: (id: string) => Promise<boolean>
  dropShelf: () => Promise<Shelf>
  hideDropShelf: () => Promise<void>
  openDropShelf: () => Promise<void>
  openWidget: (shelfId: string) => Promise<boolean>
  closeWidget: (shelfId: string) => Promise<boolean>

  // Phone and sync
  phoneStart: () => Promise<PhoneSession>
  phoneStop: () => Promise<void>
  pickFolder: () => Promise<string | null>
  syncNow: () => Promise<SyncDevice[]>
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
  /** Files added or removed outside the panel (watchers, phone, sync, expiry). */
  onFilesChanged: (cb: (change: FilesChanged) => void) => () => void
  onDropShelfShown: (cb: () => void) => () => void
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

  setNote: (id, note, tags) => invoke('set_file_note', { id, note, tags }),
  setReminder: (id, at) => invoke('set_reminder', { id, at }),
  searchContent: (query) => invoke('search_content', { query }),
  setSelection: (ids) => invoke('set_selection', { ids }),
  quickLook: (id) => invoke('quick_look', { id }),

  zipFiles: (ids) => invoke('zip_files', { ids }),
  convertImages: (ids, format, maxSide) =>
    invoke('convert_images', { ids, format, maxSide: maxSide ?? null }),
  collectFiles: (ids) => invoke('collect_files', { ids }),
  copyPaths: (ids) => invoke('copy_paths', { ids }),
  openFiles: (ids) => invoke('open_files', { ids }),
  startDragZip: (ids, name) => invoke('start_drag_zip', { ids, name }),
  pasteClipboard: (shelfId) => invoke('paste_clipboard', { shelfId: shelfId ?? null }),

  listShelves: () => invoke('list_shelves'),
  setShelfExpiry: (id, hours) => invoke('set_shelf_expiry', { id, hours }),
  listRules: () => invoke('list_rules'),
  addRule: (shelfId, extensions, source) => invoke('add_rule', { shelfId, extensions, source }),
  deleteRule: (id) => invoke('delete_rule', { id }),
  dropShelf: () => invoke('drop_shelf'),
  hideDropShelf: () => invoke('hide_drop_shelf'),
  openDropShelf: () => invoke('open_drop_shelf'),
  openWidget: (shelfId) => invoke('open_widget', { shelfId }),
  closeWidget: (shelfId) => invoke('close_widget', { shelfId }),

  phoneStart: () => invoke('phone_start'),
  phoneStop: () => invoke('phone_stop'),
  pickFolder: () => invoke('pick_folder'),
  syncNow: () => invoke('sync_now'),
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
  onFilesChanged: (cb) => onEvent<FilesChanged>('files-changed', cb),
  onDropShelfShown: (cb) => onEvent('drop-shelf-shown', cb),
  onNavigateSettings: (cb) => onEvent('navigate-settings', cb),
  onUpdateStatus: (cb) => onEvent<UpdateStatus>('update-status', cb),
  onPanelShown: (cb) => onEvent('panel-shown', cb),
  onPanelHidden: (cb) => onEvent('panel-hidden', cb)
}
