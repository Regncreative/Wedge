import type { AppLanguage } from './types'

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
}

const tr: Messages = {
  shelves: 'raf',
  shelvesCap: 'Raf',
  files: 'dosya',
  filesCap: 'Dosya',
  search: 'Ara',
  searchPlaceholder: 'Dosya ara…',
  clearSearch: 'Aramayı temizle',
  settings: 'Ayarlar',
  settingsSubtitle: 'Görünüm ve davranış',
  close: 'Kapat',
  back: 'Geri',
  cancel: 'Vazgeç',
  confirm: 'Tamam',
  save: 'Kaydet',
  delete: 'Sil',
  remove: 'Kaldır',
  language: 'Dil',
  languageTr: 'Türkçe',
  languageEn: 'English',

  dropHere: 'Dosyaları buraya bırakın',
  releaseToStash: 'Bırakarak ekle',
  emptyTitle: 'Dosyaları buraya bırakın',
  emptyHint: 'Dosyalar orijinal konumlarında kalır. Stash yalnızca referans saklar.',
  noMatch: 'Eşleşen dosya yok',
  trySearch: 'Farklı bir arama deneyin',

  folder: 'Klasör',
  fileNotFound: 'Dosya bulunamadı',
  pin: 'Sabitle',
  unpin: 'Sabitlemeyi kaldır',

  open: 'Aç',
  reveal: 'Gezgin’de göster',
  copyPath: 'Yolu kopyala',
  properties: 'Özellikler',
  removeFromShelf: 'Raftan kaldır',
  removeFileConfirm: (name) =>
    `“${name}” raftan kaldırılsın mı? Dosya diskten silinmez.`,
  moveToShelf: 'Rafa taşı',
  pathCopied: 'Yol kopyalandı',
  removedKept: 'Raftan kaldırıldı (dosya diskte duruyor)',
  movedTo: (name) => `${name} rafına taşındı`,
  couldNotOpen: 'Dosya açılamadı',
  missingOnDisk: 'Diskte yok',
  sizeBytes: (n) => `Boyut: ${n} bayt`,
  addedAt: (s) => `Eklendi: ${s}`,

  appearance: 'Görünüm',
  theme: 'Tema',
  themeSystem: 'Sistem',
  themeLight: 'Açık',
  themeDark: 'Koyu',
  accentColor: 'Vurgu rengi',
  behavior: 'Davranış',
  startWithWindows: 'Windows ile başlat',
  startWithWindowsHint: 'Oturum açılınca Stash arka planda açılsın (yalnızca kurulu sürümde)',
  notifications: 'Bildirimler',
  notificationsHint: 'Dosya ekleme ve güncelleme bildirimleri',
  idleOpacity: 'Boşta opaklık',
  idleOpacityHint: 'Mouse gelmezse panel bu seviyeye solar (10–70%)',
  idleTimeout: 'Soldurma süresi',
  idleTimeoutHint: 'Kaç saniye hareketsizlikten sonra solar (5–60 sn)',
  fileSort: 'Dosya sıralaması',
  sortAdded: 'Eklenme',
  sortName: 'İsim',
  sortRecent: 'Son açılan',
  sortSize: 'Boyut',
  clearMissing: 'Eksik dosyaları temizle',
  clearMissingHint: 'Diskte olmayan tüm referansları raftan kaldırır',
  clearMissingConfirm: (n) =>
    `${n} eksik dosya referansı raftan kaldırılsın mı? Diskteki dosyalara dokunulmaz.`,
  clearMissingDone: (n) => `${n} eksik referans temizlendi`,
  clearMissingNone: 'Eksik dosya yok',
  defaultShelf: 'Varsayılan raf',
  openHotkey: 'Panel kısayolu',
  hotkeyHint: 'Tıkla, en fazla 3 tuşa bas (Esc iptal)',
  hotkeyClick: 'Kaydet',
  hotkeyRecording: 'Tuşlara bas…',
  hotkeyEmpty: 'Kısayol yok',
  hotkeyMax: 'max 3',
  hotkeyUnavailable: 'Bu kısayol kullanılamıyor, eskisi korundu',
  shelvesSection: 'Raflar',
  updatesSection: 'Güncelleme',
  deleteShelf: (name) => `“${name}” rafını sil`,
  deleteShelfConfirm: (name) =>
    `“${name}” rafı silinsin mi? İçindeki dosyalar Stash’ten kalkar (diskten silinmez).`,
  cannotDeleteLast: 'Son raf silinemez',
  createShelf: 'Raf oluştur',
  shelfName: 'İsim',
  renameShelf: 'Rafı yeniden adlandır',
  renameShelfHint: 'Yeni raf adını yazın.',
  footer: 'Stash · Windows file shelf',

  updateChecking: 'Güncellemeler kontrol ediliyor…',
  updateAvailable: (v) => `${v} indiriliyor…`,
  updateDownloading: (n) => `Güncelleme indiriliyor… %${n}`,
  updateReady: (v) => `${v} hazır — yeniden başlatınca kurulur`,
  updateLatest: 'Güncelsiniz',
  updateDev: 'Güncelleme yalnızca kurulu sürümde çalışır',
  updateError: 'Güncelleme başarısız',
  updateErrorHint: '1.0.1 ve öncesi otomatik güncellenemiyor. En son kurucuyu indir.',
  downloadManually: 'Manuel indir',
  checkUpdates: 'Güncellemeleri denetle',
  installAndRestart: 'Kur ve yeniden başlat',
  currentVersion: (v) => `Sürüm ${v}`,

  filesAdded: (n, shelf) => `✓ ${n} dosya eklendi · ${shelf}`,
  alreadyOnShelf: 'Bu rafta zaten var',

  openPanel: 'Aç',
  quit: 'Çıkış',

  filterAll: 'Tümü',
  filterImages: 'Görsel',
  filterVideos: 'Video',
  filterPdf: 'PDF',
  filterOffice: 'Office',
  filterFolders: 'Klasör',
  filterArchives: 'Arşiv',
  filterCode: 'Kod',
  filterAudio: 'Ses',

  trayOpen: 'Aç',
  traySettings: 'Ayarlar',
  trayCheckUpdates: 'Güncellemeleri denetle',
  trayQuit: 'Stash’ten çık',

  updateNotifyTitle: 'Stash güncellemesi',
  updateNotifyBody: (v) => `${v} sürümü indiriliyor…`,
  updateReadyNotifyTitle: 'Stash hazır',
  updateReadyNotifyBody: (v) => `${v} indirildi. Yeniden başlatınca kurulur.`,
  updateUpToDateNotify: (v) => `Güncelsiniz (${v})`
}

const en: Messages = {
  shelves: 'shelf',
  shelvesCap: 'Shelves',
  files: 'files',
  filesCap: 'Files',
  search: 'Search',
  searchPlaceholder: 'Search files…',
  clearSearch: 'Clear search',
  settings: 'Settings',
  settingsSubtitle: 'Appearance and behavior',
  close: 'Close',
  back: 'Back',
  cancel: 'Cancel',
  confirm: 'OK',
  save: 'Save',
  delete: 'Delete',
  remove: 'Remove',
  language: 'Language',
  languageTr: 'Türkçe',
  languageEn: 'English',

  dropHere: 'Drop files here',
  releaseToStash: 'Release to add',
  emptyTitle: 'Drop files here',
  emptyHint: 'Files stay in their original location. Stash only stores references.',
  noMatch: 'No matching files',
  trySearch: 'Try a different search',

  folder: 'Folder',
  fileNotFound: 'File not found',
  pin: 'Pin',
  unpin: 'Unpin',

  open: 'Open',
  reveal: 'Show in Explorer',
  copyPath: 'Copy path',
  properties: 'Properties',
  removeFromShelf: 'Remove from shelf',
  removeFileConfirm: (name) =>
    `Remove “${name}” from the shelf? The file on disk is not deleted.`,
  moveToShelf: 'Move to shelf',
  pathCopied: 'Path copied',
  removedKept: 'Removed from shelf (file kept on disk)',
  movedTo: (name) => `Moved to ${name}`,
  couldNotOpen: 'Could not open file',
  missingOnDisk: 'Missing on disk',
  sizeBytes: (n) => `Size: ${n} bytes`,
  addedAt: (s) => `Added: ${s}`,

  appearance: 'Appearance',
  theme: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  accentColor: 'Accent color',
  behavior: 'Behavior',
  startWithWindows: 'Start with Windows',
  startWithWindowsHint: 'Launch Stash in the background at sign-in (installed build only)',
  notifications: 'Notifications',
  notificationsHint: 'Alerts for added files and updates',
  idleOpacity: 'Idle opacity',
  idleOpacityHint: 'Fade to this level when the mouse stays away (10–70%)',
  idleTimeout: 'Fade delay',
  idleTimeoutHint: 'Seconds of inactivity before fading (5–60s)',
  fileSort: 'File sort',
  sortAdded: 'Date added',
  sortName: 'Name',
  sortRecent: 'Recently opened',
  sortSize: 'Size',
  clearMissing: 'Clear missing files',
  clearMissingHint: 'Remove all references that are gone from disk',
  clearMissingConfirm: (n) =>
    `Remove ${n} missing file reference(s) from shelves? Nothing is deleted from disk.`,
  clearMissingDone: (n) => `Cleared ${n} missing reference(s)`,
  clearMissingNone: 'No missing files',
  defaultShelf: 'Default shelf',
  openHotkey: 'Panel hotkey',
  hotkeyHint: 'Click, then press up to 3 keys (Esc to cancel)',
  hotkeyClick: 'Record',
  hotkeyRecording: 'Press keys…',
  hotkeyEmpty: 'No hotkey',
  hotkeyMax: 'max 3',
  hotkeyUnavailable: 'That hotkey is unavailable — kept the previous one',
  shelvesSection: 'Shelves',
  updatesSection: 'Updates',
  deleteShelf: (name) => `Delete “${name}”`,
  deleteShelfConfirm: (name) =>
    `Delete shelf “${name}”? Files are removed from Stash only (not from disk).`,
  cannotDeleteLast: 'Cannot delete the last shelf',
  createShelf: 'Create shelf',
  shelfName: 'Name',
  renameShelf: 'Rename shelf',
  renameShelfHint: 'Enter a new shelf name.',
  footer: 'Stash · Windows file shelf',

  updateChecking: 'Checking for updates…',
  updateAvailable: (v) => `Downloading ${v}…`,
  updateDownloading: (n) => `Downloading update… ${n}%`,
  updateReady: (v) => `${v} ready — restarts to install`,
  updateLatest: 'You’re up to date',
  updateDev: 'Updates only work in the installed app',
  updateError: 'Update failed',
  updateErrorHint: '1.0.1 and earlier can’t auto-update. Download the latest installer.',
  downloadManually: 'Download manually',
  checkUpdates: 'Check for updates',
  installAndRestart: 'Install and restart',
  currentVersion: (v) => `Version ${v}`,

  filesAdded: (n, shelf) => `✓ ${n} files added · ${shelf}`,
  alreadyOnShelf: 'Already on this shelf',

  openPanel: 'Open',
  quit: 'Quit',

  filterAll: 'All',
  filterImages: 'Images',
  filterVideos: 'Videos',
  filterPdf: 'PDF',
  filterOffice: 'Office',
  filterFolders: 'Folders',
  filterArchives: 'Zips',
  filterCode: 'Code',
  filterAudio: 'Audio',

  trayOpen: 'Open',
  traySettings: 'Settings',
  trayCheckUpdates: 'Check for updates',
  trayQuit: 'Quit Stash',

  updateNotifyTitle: 'Stash update',
  updateNotifyBody: (v) => `Downloading ${v}…`,
  updateReadyNotifyTitle: 'Stash is ready',
  updateReadyNotifyBody: (v) => `${v} downloaded. Restart to install.`,
  updateUpToDateNotify: (v) => `You’re up to date (${v})`
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
