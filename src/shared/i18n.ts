import type { AppLanguage } from './types'
import { en } from './locales/en'
import { tr } from './locales/tr'

export type { AppLanguage }

export type Messages = {
  shelves: string
  shelvesCap: string
  files: string
  filesCap: string
  search: string
  searchPlaceholder: string
  clearSearch: string
  settings: string
  settingsSubtitle: string
  close: string
  back: string
  cancel: string
  confirm: string
  save: string
  delete: string
  remove: string
  language: string
  languageTr: string
  languageEn: string

  dropHere: string
  releaseToStash: string
  emptyTitle: string
  emptyHint: string
  noMatch: string
  trySearch: string

  folder: string
  fileNotFound: string
  pin: string
  unpin: string

  open: string
  reveal: string
  copyPath: string
  properties: string
  removeFromShelf: string
  removeFileConfirm: (name: string) => string
  moveToShelf: string
  pathCopied: string
  removedKept: string
  movedTo: (name: string) => string
  couldNotOpen: string
  missingOnDisk: string
  sizeBytes: (n: number) => string
  addedAt: (s: string) => string

  appearance: string
  theme: string
  themeSystem: string
  themeLight: string
  themeDark: string
  accentColor: string
  behavior: string
  startWithWindows: string
  startWithWindowsHint: string
  notifications: string
  notificationsHint: string
  idleOpacity: string
  idleOpacityHint: string
  idleTimeout: string
  idleTimeoutHint: string
  fileSort: string
  sortAdded: string
  sortName: string
  sortRecent: string
  sortSize: string
  clearMissing: string
  clearMissingHint: string
  clearMissingConfirm: (n: number) => string
  clearMissingDone: (n: number) => string
  clearMissingNone: string
  defaultShelf: string
  openHotkey: string
  hotkeyHint: string
  hotkeyClick: string
  hotkeyRecording: string
  hotkeyEmpty: string
  hotkeyMax: string
  hotkeyUnavailable: string
  shelvesSection: string
  updatesSection: string
  deleteShelf: (name: string) => string
  deleteShelfConfirm: (name: string) => string
  cannotDeleteLast: string
  createShelf: string
  shelfName: string
  renameShelf: string
  renameShelfHint: string
  footer: string

  updateChecking: string
  updateAvailable: (v: string) => string
  updateDownloading: (n: number) => string
  updateReady: (v: string) => string
  updateLatest: string
  updateDev: string
  updateError: string
  updateErrorHint: string
  downloadManually: string
  checkUpdates: string
  installAndRestart: string
  currentVersion: (v: string) => string

  filesAdded: (n: number, shelf: string) => string
  alreadyOnShelf: string

  openPanel: string
  quit: string

  filterAll: string
  filterImages: string
  filterVideos: string
  filterPdf: string
  filterOffice: string
  filterFolders: string
  filterArchives: string
  filterCode: string
  filterAudio: string

  trayOpen: string
  traySettings: string
  trayCheckUpdates: string
  trayQuit: string

  updateNotifyTitle: string
  updateNotifyBody: (v: string) => string
  updateReadyNotifyTitle: string
  updateReadyNotifyBody: (v: string) => string
  updateUpToDateNotify: (v: string) => string

  filesListLabel: string
  selectedCount: (n: number) => string
  clearSelection: string
  pinSelected: string
  removeSelectedConfirm: (n: number) => string
  removedMany: (n: number) => string
  welcomeTitle: string
  welcomeDropTitle: string
  welcomeDropBody: string
  welcomeDragTitle: string
  welcomeDragBody: string
  welcomeHotkeyTitle: string
  welcomeHotkeyBody: (hotkey: string) => string
  welcomeStart: string
  betaUpdates: string
  betaUpdatesHint: string
  dataSection: string
  exportData: string
  importData: string
  dataHint: string
  exportDone: string
  importDone: (shelves: number, files: number) => string
  importFailed: string
  openLogs: string
  openLogsHint: string
  preview: string
  noteAndTags: string
  noteTitle: string
  notePlaceholder: string
  tagsPlaceholder: string
  remind: string
  remindIn1h: string
  remindTomorrow: string
  remindNextWeek: string
  remindClear: string
  reminderSet: (when: string) => string
  reminderCleared: string
  convert: string
  toFormat: (format: string) => string
  shrinkTo: (px: number) => string
  converted: (n: number) => string
  convertFailed: string
  makeZip: string
  zipDone: string
  copyToFolder: string
  copiedTo: (n: number) => string
  pathsCopied: (n: number) => string
  openAll: string
  more: string
  dragAsZip: string
  pastedFiles: (n: number) => string
  pastedImage: string
  pastedLink: string
  pastedText: string
  clipboardEmpty: string
  tempShelf: string
  expiryOff: string
  expiry24h: string
  expiry7d: string
  expiry30d: string
  expiresBadge: (label: string) => string
  pinToDesktop: string
  unpinFromDesktop: string
  phoneButton: string
  phoneTitle: string
  phoneHint: string
  phoneExpires: (min: number) => string
  phoneFirewall: string
  phoneError: string
  phoneReceived: (n: number) => string
  noPreview: string
  dropShelfHint: string
  dragAll: string
  clearShelf: string
  widgetEmpty: string
  autoAdded: (n: number, shelf: string) => string
  autoShelves: string
  watchDownloads: string
  watchDownloadsHint: string
  watchScreenshots: string
  watchScreenshotsHint: string
  gestures: string
  shakeToOpen: string
  shakeToOpenHint: string
  edgeReveal: string
  edgeRevealHint: string
  edgeOff: string
  edgeLeft: string
  edgeRight: string
  windowsSection: string
  contextMenuToggle: string
  contextMenuHint: string
  pasteHotkey: string
  pasteHotkeyHint: string
  rulesSection: string
  rulesHint: string
  ruleExtensions: string
  ruleAllFiles: string
  ruleSourceAny: string
  sourceManual: string
  sourceDownloads: string
  sourceScreenshots: string
  sourcePhone: string
  sourceClipboard: string
  addRule: string
  noRules: string
  syncSection: string
  syncHint: string
  syncChoose: string
  syncOff: string
  syncNow: string
  syncThisPc: string
  syncFailed: string
}

export const dictionaries: Record<AppLanguage, Messages> = { tr, en }

/** Turkish UI only for Turkish system locales; everything else → English. */
export function resolveSystemLanguage(locale: string | null | undefined): AppLanguage {
  const raw = String(locale ?? '')
    .toLowerCase()
    .replace(/_/g, '-')
  if (raw === 'tr' || raw.startsWith('tr-')) return 'tr'
  return 'en'
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value === 'en' ? 'en' : value === 'tr' ? 'tr' : 'en'
}

export function getMessages(lang: string | null | undefined): Messages {
  return dictionaries[normalizeLanguage(lang)]
}
