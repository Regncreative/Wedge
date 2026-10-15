import type { AppLanguage } from './types'
import { en } from './locales/en'
import { tr } from './locales/tr'

export type { AppLanguage }

export type Messages = {
  // Common
  shelvesCap: string
  filesCap: string
  search: string
  searchPlaceholder: string
  clearSearch: string
  settings: string
  close: string
  back: string
  cancel: string
  confirm: string
  save: string
  delete: string
  remove: string
  more: string

  // Rail and header
  allFiles: string
  railLabel: string
  newShelf: string
  newSharedShelf: string
  shelfName: string
  createShelf: string
  filesCount: (n: number) => string
  viewList: string
  viewGrid: string
  shelfOptions: string
  sharedBadge: string
  tempShelf: string
  expiresBadge: (label: string) => string

  // Filters
  filterImages: string
  filterVideos: string
  filterAudio: string
  filterPdf: string
  filterOffice: string
  filterArchives: string
  filterFolders: string
  filterCode: string
  filterExecutables: string
  filterOther: string
  filtersLabel: string

  // Edge tabs and drawer
  tabSubNormal: string
  tabSubTemp: (label: string) => string
  tabSubShared: string
  tabSubAuto: string
  tabSubPocket: string
  drawerMeta: (n: number, size: string) => string
  searchMeta: (n: number) => string
  keepOpen: string
  pocketHint: string
  pocketBundle: (n: number) => string
  pocketBundleHint: string
  pocketEmptyTitle: string
  pocketEmptyHint: string
  pocketLeft: (n: number) => string
  emptyEdgeHint: string
  sharedChip: string
  shelfColor: string
  shelfIcon: string

  // Dropping
  dropTo: (shelf: string) => string
  filesAdded: (n: number, shelf: string) => string
  alreadyOnShelf: string
  copying: string

  // Empty states
  emptyTitle: string
  emptyHint: string
  emptySharedHint: string
  emptyAllTitle: string
  noMatch: string
  trySearch: string

  // Files
  folder: string
  fileNotFound: string
  pin: string
  pinned: string
  unpin: string
  open: string
  preview: string
  reveal: string
  copyPath: string
  properties: string
  removeFromShelf: string
  removeFileConfirm: (name: string) => string
  removeSelectedConfirm: (n: number) => string
  removeSharedConfirm: (name: string) => string
  removeSharedManyConfirm: (n: number) => string
  removedKept: string
  removedMany: (n: number) => string
  recycled: (n: number) => string
  recycleFailed: string
  moveToShelf: string
  movedTo: (name: string) => string
  copiedToShared: (name: string) => string
  pathCopied: string
  pathsCopied: (n: number) => string
  couldNotOpen: string
  missingOnDisk: string
  filesListLabel: string
  selectedCount: (n: number) => string
  clearSelection: string
  pinSelected: string
  noPreview: string

  // Notes and reminders
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

  // Quick actions
  convert: string
  toFormat: (format: string) => string
  shrink: string
  convertedOne: (name: string, before: string, after: string) => string
  convertedMany: (n: number, before: string, after: string) => string
  alreadySmall: string
  convertFailed: string
  makeZip: string
  zipDone: string
  copyToFolder: string
  copiedTo: (n: number) => string
  openAll: string
  dragAsZip: string

  // Clipboard
  pastedFiles: (n: number) => string
  pastedImage: string
  pastedLink: string
  pastedText: string
  clipboardEmpty: string

  // Shelf menu
  renameShelf: string
  renameShelfHint: string
  expiryOff: string
  expiry24h: string
  expiry7d: string
  expiry30d: string
  pinToDesktop: string
  unpinFromDesktop: string
  openFolder: string
  deleteShelf: (name: string) => string
  deleteShelfConfirm: (name: string) => string
  deleteSharedShelfConfirm: (name: string) => string
  cannotDeleteLast: string

  // Shared shelves
  sharedTitle: string
  sharedIntro: string
  sharedHowCopy: string
  sharedHowSee: string
  sharedHowRemove: string
  sharedHowFriend: string
  sharedHowPrivate: string
  chooseFolder: string
  sharedCreated: (name: string) => string
  folderUnavailable: string

  // Phone
  phoneButton: string
  phoneTitle: string
  phoneHint: string
  phoneExpires: (min: number) => string
  phoneFirewall: string
  phoneError: string
  phoneReceived: (n: number) => string

  // Automatic arrivals
  autoAdded: (n: number, shelf: string) => string
  sharedArrived: (n: number, shelf: string) => string

  // Edge handle and widget
  edgeDropTitle: string
  edgeAdded: (n: number, shelf: string) => string
  edgeOpen: string
  widgetEmpty: string

  // Settings
  generalSection: string
  captureSection: string
  sharedSection: string
  sharedSectionHint: string
  noSharedShelves: string
  rulesSection: string
  rulesHint: string
  maintenanceSection: string
  updatesSection: string
  theme: string
  themeSystem: string
  themeLight: string
  themeDark: string
  accentColor: string
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
  defaultShelf: string
  defaultShelfHint: string
  openHotkey: string
  hotkeyHint: string
  hotkeyClick: string
  hotkeyRecording: string
  hotkeyEmpty: string
  hotkeyMax: string
  hotkeyUnavailable: string
  edgeHandle: string
  edgeHandleHint: string
  edgeOff: string
  edgeLeft: string
  edgeRight: string
  contextMenuToggle: string
  contextMenuHint: string
  watchDownloads: string
  watchDownloadsHint: string
  watchScreenshots: string
  watchScreenshotsHint: string
  ruleExtensions: string
  ruleAllFiles: string
  ruleSourceAny: string
  ruleSource: string
  ruleShelf: string
  sourceManual: string
  sourceDownloads: string
  sourceScreenshots: string
  sourcePhone: string
  sourceClipboard: string
  addRule: string
  noRules: string
  clearMissing: string
  clearMissingHint: string
  clearMissingConfirm: (n: number) => string
  clearMissingDone: (n: number) => string
  clearMissingNone: string
  exportData: string
  importData: string
  dataHint: string
  exportDone: string
  importDone: (shelves: number, files: number) => string
  importFailed: string
  openLogs: string
  openLogsHint: string
  betaUpdates: string
  betaUpdatesHint: string
  checkUpdates: string
  installAndRestart: string
  currentVersion: (v: string) => string
  updateChecking: string
  updateAvailable: (v: string) => string
  updateDownloading: (n: number) => string
  updateReady: (v: string) => string
  updateLatest: string
  updateDev: string
  updateError: string
  updateErrorHint: string
  downloadManually: string

  // Welcome
  welcomeTitle: string
  welcomeSubtitle: string
  welcomeDropTitle: string
  welcomeDropBody: string
  welcomeEdgeTitle: string
  welcomeEdgeBody: string
  welcomeDragTitle: string
  welcomeDragBody: string
  welcomeHotkeyTitle: string
  welcomeHotkeyBody: (hotkey: string) => string
  welcomeStart: string
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
