/** Shared domain types for Stash */

export type ThemeMode = 'system' | 'light' | 'dark'
export type AppLanguage = 'tr' | 'en'
export type FileSort = 'added' | 'name' | 'recent' | 'size'
export type UpdateChannel = 'stable' | 'beta'
export type EdgeReveal = 'off' | 'left' | 'right'
/** How a file got onto a shelf. */
export type FileSource = 'manual' | 'downloads' | 'screenshots' | 'phone' | 'clipboard' | 'sync'
/** Automatic shelves are filled by Stash itself. */
export type ShelfKind = 'normal' | 'downloads' | 'screenshots' | 'phone' | 'clipboard' | 'drop'

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
  | { kind: 'image'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'none' }

export interface PhoneSession {
  url: string
  qrSvg: string
  expiresAt: number
}

export interface SyncDevice {
  name: string
  updatedAt: number
  thisPc: boolean
}

export interface FilesChanged {
  added: number
  shelfName: string
  source: FileSource | 'expiry'
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
  /** Shaking the mouse while dragging opens a drop shelf at the cursor. */
  shakeToOpen: boolean
  /** Pushing the cursor against this screen edge opens the panel. */
  edgeReveal: EdgeReveal
  /** "Add to Stash" in Explorer's right-click menu. */
  contextMenu: boolean
  /** Fills the selected file's path into an Open/Save dialog. */
  pasteHotkey: string
  /** Cloud-synced folder used to sync shelves between PCs; empty = off. */
  syncFolder: string
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

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: '#2563EB',
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
  shakeToOpen: true,
  edgeReveal: 'off',
  contextMenu: true,
  pasteHotkey: 'Control+Alt+V',
  syncFolder: ''
}

/** Ensure settings always have valid numeric/enum fields (older DBs / partial IPC). */
export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
  s.language = s.language === 'tr' ? 'tr' : 'en'
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
  s.shakeToOpen = s.shakeToOpen !== false
  s.edgeReveal = s.edgeReveal === 'left' || s.edgeReveal === 'right' ? s.edgeReveal : 'off'
  s.contextMenu = s.contextMenu !== false
  s.syncFolder = typeof s.syncFolder === 'string' ? s.syncFolder : ''
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
export const ARCHIVE_EXTS = new Set([
  'zip',
  'rar',
  '7z',
  'tar',
  'gz',
  'bz2',
  'xz',
  'iso',
  'cab'
])
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
