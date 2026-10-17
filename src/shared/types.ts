/** Shared domain types for Stash */

export type ThemeMode = 'system' | 'light' | 'dark'
export const LANGUAGES = ['tr', 'en', 'ru', 'fr', 'es', 'de', 'pt', 'it', 'pl', 'ja'] as const
export type AppLanguage = (typeof LANGUAGES)[number]
export type FileSort = 'added' | 'name' | 'recent' | 'size'
export type UpdateChannel = 'stable' | 'beta'
/** Where the edge handle sits (a drop target and panel opener on the screen edge). */
export type EdgeHandle = 'off' | 'left' | 'right'
/** Where along the edge the tabs sit. */
export type EdgeAlign = 'top' | 'center' | 'bottom'

/** A display, for the setting (src-tauri/src/panel.rs, list_monitors). */
export interface MonitorInfo {
  /** Its device name, what `edgeMonitor` stores. */
  id: string
  /** 1, 2, … as Windows numbers them. */
  number: number
  width: number
  height: number
  primary: boolean
}
/** How a file got onto a shelf. */
export type FileSource = 'manual' | 'downloads' | 'screenshots' | 'phone' | 'clipboard' | 'shared'
/** Automatic shelves are filled by Stash itself; shared shelves mirror a folder. */
export type ShelfKind =
  'normal' | 'downloads' | 'screenshots' | 'phone' | 'clipboard' | 'shared' | 'pocket' | 'drop'

export type FileFilter =
  | 'all'
  | 'images'
  | 'videos'
  | 'archives'
  | 'folders'
  | 'pdf'
  | 'office'
  | 'executables'
  | 'code'
  | 'audio'
  | 'unknown'

export interface Shelf {
  id: string
  name: string
  icon: string
  color: string
  createdAt: number
  sortOrder: number
  kind: ShelfKind
  /** Files older than this many hours are removed (temporary shelf). */
  expireHours: number | null
  /**
   * Shared shelf: the folder it mirrors (e.g. in Google Drive). Files added
   * are copied there; whatever is in the folder shows on the shelf.
   */
  folder: string | null
}

export interface StashFile {
  id: string
  shelfId: string
  absolutePath: string
  name: string
  extension: string
  size: number
  isDirectory: boolean
  createdAt: number
  addedAt: number
  lastAccessed: number | null
  isPinned: boolean
  note: string
  /** Comma-separated. */
  tags: string
  /** Reminder time (ms since epoch). */
  remindAt: number | null
  source: FileSource
  exists: boolean
}

export interface Rule {
  id: string
  shelfId: string
  /** Comma-separated extensions; empty = every file. */
  extensions: string
  source: 'any' | FileSource
}

export type Preview =
  { kind: 'image'; url: string } | { kind: 'text'; text: string } | { kind: 'none' }

export interface PhoneSession {
  url: string
  qrSvg: string
  expiresAt: number
}

export interface FilesChanged {
  added: number
  shelfName: string
  /** 'app': a change made in one of Wedge's windows. */
  source: FileSource | 'expiry' | 'app'
}

/** An image written by Convert / Reduce size, with its size before and after. */
export interface ConvertedImage {
  name: string
  before: number
  after: number
}

export interface ConvertResult {
  results: ConvertedImage[]
  failed: number
}

export interface ShrinkResult extends ConvertResult {
  /** Images that couldn't get smaller (nothing was written). */
  alreadySmall: number
}

export interface AppSettings {
  theme: ThemeMode
  accentColor: string
  startWithWindows: boolean
  language: AppLanguage
  openHotkey: string
  defaultShelfId: string
  /** Last shelf the user viewed — restored when the panel opens. */
  lastShelfId: string
  notifications: boolean
  /** How to order files within a shelf (pinned still first). */
  fileSort: FileSort
  /**
   * Panel opacity after idle timeout without mouse hover.
   * Clamped to 0.10–0.70 (shown as 10%–70% in settings).
   */
  idleOpacity: number
  /** Seconds without mouse activity before fading (5–60). */
  idleTimeoutSec: number
  /** 'beta' also offers pre-release versions. */
  updateChannel: UpdateChannel
  /** First-run welcome has been dismissed. */
  onboardingDone: boolean
  /** New files in Downloads land on the Downloads shelf. */
  watchDownloads: boolean
  /** New screenshots land on the Screenshots shelf. */
  watchScreenshots: boolean
  /** A small handle on this screen edge: drop files on it, click to open the panel. */
  edgeHandle: EdgeHandle
  /** 'primary', 'cursor' (the display with the mouse) or a display's id. */
  edgeMonitor: string
  edgeAlign: EdgeAlign
  /** Tucked in, the tabs leave the screen entirely (no sliver). */
  edgeAutoHide: boolean
  /** "Add to Wedge" in Explorer's right-click menu. */
  contextMenu: boolean
}

export interface ShelfStats {
  shelfCount: number
  fileCount: number
  totalSize: number
}

export interface AddFilesResult {
  added: number
  skipped: number
  shelfId: string
  shelfName: string
}

export interface FileProperties {
  file: StashFile
  exists: boolean
  modifiedAt: number | null
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'dev' }
  /** The Microsoft Store build: the Store installs updates. */
  | { state: 'store' }

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: '#8D97FF',
  startWithWindows: true,
  language: 'en',
  openHotkey: 'CommandOrControl+Shift+Space',
  defaultShelfId: '',
  lastShelfId: '',
  notifications: true,
  fileSort: 'added',
  idleOpacity: 0.4,
  idleTimeoutSec: 10,
  updateChannel: 'stable',
  onboardingDone: false,
  watchDownloads: true,
  watchScreenshots: true,
  edgeHandle: 'right',
  edgeMonitor: 'primary',
  edgeAlign: 'center',
  edgeAutoHide: false,
  contextMenu: true
}

/** Ensure settings always have valid numeric/enum fields (older DBs / partial IPC). */
export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
  s.language = (LANGUAGES as readonly string[]).includes(s.language) ? s.language : 'en'
  const idle = Number(s.idleOpacity)
  s.idleOpacity = Number.isFinite(idle)
    ? Math.min(0.7, Math.max(0.1, idle))
    : DEFAULT_SETTINGS.idleOpacity
  const timeout = Number(s.idleTimeoutSec)
  s.idleTimeoutSec = Number.isFinite(timeout)
    ? Math.min(60, Math.max(5, Math.round(timeout)))
    : DEFAULT_SETTINGS.idleTimeoutSec
  if (!['added', 'name', 'recent', 'size'].includes(String(s.fileSort))) {
    s.fileSort = 'added'
  }
  s.notifications = s.notifications !== false
  s.startWithWindows = s.startWithWindows === true
  s.updateChannel = s.updateChannel === 'beta' ? 'beta' : 'stable'
  s.onboardingDone = s.onboardingDone === true
  s.watchDownloads = s.watchDownloads !== false
  s.watchScreenshots = s.watchScreenshots !== false
  s.edgeHandle = s.edgeHandle === 'left' || s.edgeHandle === 'off' ? s.edgeHandle : 'right'
  s.contextMenu = s.contextMenu !== false
  s.edgeMonitor = typeof s.edgeMonitor === 'string' && s.edgeMonitor ? s.edgeMonitor : 'primary'
  s.edgeAlign = s.edgeAlign === 'top' || s.edgeAlign === 'bottom' ? s.edgeAlign : 'center'
  s.edgeAutoHide = s.edgeAutoHide === true
  return s
}

export const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'svg',
  'tiff',
  'tif',
  'heic',
  'avif'
])
export const VIDEO_EXTS = new Set([
  'mp4',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'webm',
  'flv',
  'm4v',
  'mpeg',
  'mpg'
])
export const AUDIO_EXTS = new Set([
  'mp3',
  'wav',
  'flac',
  'aac',
  'ogg',
  'wma',
  'm4a',
  'aiff',
  'opus'
])
export const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab'])
export const OFFICE_EXTS = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'csv'
])
export const CODE_EXTS = new Set([
  'js',
  'ts',
  'tsx',
  'jsx',
  'py',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'rb',
  'php',
  'swift',
  'kt',
  'html',
  'css',
  'scss',
  'json',
  'xml',
  'yml',
  'yaml',
  'toml',
  'md',
  'sql',
  'sh',
  'ps1',
  'bat'
])
export const EXEC_EXTS = new Set(['exe', 'msi', 'bat', 'cmd', 'ps1', 'com', 'scr', 'msix', 'appx'])

export function classifyExtension(ext: string, isDirectory: boolean): FileFilter {
  if (isDirectory) return 'folders'
  const e = ext.toLowerCase()
  if (IMAGE_EXTS.has(e)) return 'images'
  if (VIDEO_EXTS.has(e)) return 'videos'
  if (AUDIO_EXTS.has(e)) return 'audio'
  if (ARCHIVE_EXTS.has(e)) return 'archives'
  if (e === 'pdf') return 'pdf'
  if (OFFICE_EXTS.has(e)) return 'office'
  if (EXEC_EXTS.has(e)) return 'executables'
  if (CODE_EXTS.has(e)) return 'code'
  return 'unknown'
}

export function matchesFilter(file: StashFile, filter: FileFilter): boolean {
  if (filter === 'all') return true
  return classifyExtension(file.extension, file.isDirectory) === filter
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}
