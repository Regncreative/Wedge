import { create } from 'zustand'
import type {
  AppSettings,
  FileFilter,
  Shelf,
  ShelfStats,
  StashFile
} from '@shared/types'
import { matchesFilter, normalizeSettings } from '@shared/types'

function pickShelfId(
  preferred: string | null | undefined,
  shelves: Shelf[],
  fallback?: string | null
): string | null {
  if (preferred && shelves.some((s) => s.id === preferred)) return preferred
  if (fallback && shelves.some((s) => s.id === fallback)) return fallback
  return shelves[0]?.id ?? null
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** If set, shows a text field (prompt mode). */
  promptDefault?: string
  promptPlaceholder?: string
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (value: string | boolean | null) => void
}

interface StashState {
  ready: boolean
  shelves: Shelf[]
  files: StashFile[]
  stats: ShelfStats
  settings: AppSettings | null
  appVersion: string
  activeShelfId: string | null
  searchQuery: string
  filter: FileFilter
  pinned: boolean
  showSettings: boolean
  theme: 'light' | 'dark'
  toast: { message: string; id: number } | null
  contextMenu: {
    x: number
    y: number
    fileId: string
  } | null
  dropActive: boolean
  confirm: PendingConfirm | null
  /** Multi-selection (Ctrl/Shift+click, keyboard), in selection order. */
  selectedIds: string[]
  /** Fixed end of a Shift range. */
  anchorId: string | null
  /** Row with keyboard focus (roving tabindex). */
  focusedId: string | null

  init: () => Promise<void>
  refresh: () => Promise<void>
  setActiveShelf: (id: string | null) => void
  setSearch: (q: string) => void
  setFilter: (f: FileFilter) => void
  setPinned: (p: boolean) => Promise<void>
  setShowSettings: (v: boolean) => void
  resetPanelUi: () => void
  setTheme: (t: 'light' | 'dark') => void
  showToast: (message: string) => void
  clearToast: () => void
  openContextMenu: (x: number, y: number, fileId: string) => void
  closeContextMenu: () => void
  setDropActive: (v: boolean) => void
  /** Resolves false when the main process rejected the change (it is rolled back). */
  updateSettings: (partial: Partial<AppSettings>) => Promise<boolean>
  getVisibleFiles: () => StashFile[]
  askConfirm: (req: ConfirmRequest) => Promise<boolean>
  askPrompt: (req: ConfirmRequest) => Promise<string | null>
  resolveConfirm: (value: string | boolean | null) => void
  selectFile: (id: string, mode: 'single' | 'toggle' | 'range') => void
  selectAll: () => void
  clearSelection: () => void
  setFocused: (id: string | null) => void
}

const NO_SELECTION = { selectedIds: [] as string[], anchorId: null, focusedId: null }

export const useStashStore = create<StashState>((set, get) => ({
  ready: false,
  shelves: [],
  files: [],
  stats: { shelfCount: 0, fileCount: 0, totalSize: 0 },
  settings: null,
  appVersion: '',
  activeShelfId: null,
  searchQuery: '',
  filter: 'all',
  pinned: false,
  showSettings: false,
  theme: 'dark',
  toast: null,
  contextMenu: null,
  dropActive: false,
  confirm: null,
  selectedIds: [],
  anchorId: null,
  focusedId: null,

  init: async () => {
    const [shelves, settings, systemTheme, pinned, appVersion] = await Promise.all([
      window.stash.listShelves(),
      window.stash.getSettings(),
      window.stash.getSystemTheme(),
      window.stash.isPinned(),
      window.stash.getAppVersion()
    ])

    const theme =
      settings.theme === 'system' ? systemTheme : (settings.theme as 'light' | 'dark')

    document.documentElement.style.setProperty('--accent', settings.accentColor)
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.lang = settings.language

    const activeShelfId = pickShelfId(settings.lastShelfId, shelves, settings.defaultShelfId)
    const [files, stats] = await Promise.all([
      window.stash.listFiles(null),
      window.stash.getStats()
    ])

    set({
      ready: true,
      shelves,
      files,
      stats,
      settings: normalizeSettings(settings),
      appVersion,
      activeShelfId,
      pinned,
      theme,
      showSettings: false
    })
  },

  refresh: async () => {
    const [shelves, files, stats, settings] = await Promise.all([
      window.stash.listShelves(),
      window.stash.listFiles(null),
      window.stash.getStats(),
      window.stash.getSettings()
    ])
    document.documentElement.lang = settings.language
    const activeShelfId = pickShelfId(
      get().activeShelfId,
      shelves,
      settings.lastShelfId || settings.defaultShelfId
    )
    const present = new Set(files.map((f) => f.id))
    const { selectedIds, focusedId, anchorId } = get()
    set({
      shelves,
      files,
      stats,
      settings: normalizeSettings(settings),
      activeShelfId,
      selectedIds: selectedIds.filter((id) => present.has(id)),
      focusedId: focusedId && present.has(focusedId) ? focusedId : null,
      anchorId: anchorId && present.has(anchorId) ? anchorId : null
    })
  },

  setActiveShelf: (id) => {
    set({ activeShelfId: id, showSettings: false, ...NO_SELECTION })
    if (id) void get().updateSettings({ lastShelfId: id })
  },
  setSearch: (q) => set({ searchQuery: q, ...NO_SELECTION }),
  setFilter: (f) => set({ filter: f, ...NO_SELECTION }),

  setPinned: async (p) => {
    await window.stash.setPinned(p)
    set({ pinned: p })
  },

  setShowSettings: (v) => set({ showSettings: v }),
  resetPanelUi: () => {
    const pending = get().confirm
    set({
      showSettings: false,
      contextMenu: null,
      confirm: null,
      searchQuery: '',
      dropActive: false,
      ...NO_SELECTION
    })
    pending?.resolve(false)
  },
  setTheme: (t) => {
    document.documentElement.classList.toggle('light', t === 'light')
    document.documentElement.classList.toggle('dark', t === 'dark')
    set({ theme: t })
  },

  showToast: (message) => set({ toast: { message, id: Date.now() } }),
  clearToast: () => set({ toast: null }),

  openContextMenu: (x, y, fileId) => set({ contextMenu: { x, y, fileId } }),
  closeContextMenu: () => set({ contextMenu: null }),
  setDropActive: (v) => set({ dropActive: v }),

  updateSettings: async (partial) => {
    const prev = get().settings
    // Optimistic update so toggles/sort apply immediately (even before IPC).
    if (prev) {
      set({ settings: normalizeSettings({ ...prev, ...partial }) })
    }
    try {
      const next = normalizeSettings(await window.stash.setSettings(partial))
      set({ settings: next })
      if (partial.language) {
        document.documentElement.lang = next.language
      }
      if (partial.accentColor) {
        document.documentElement.style.setProperty('--accent', partial.accentColor)
      }
      if (partial.theme) {
        const systemTheme = await window.stash.getSystemTheme()
        const theme =
          partial.theme === 'system' ? systemTheme : (partial.theme as 'light' | 'dark')
        get().setTheme(theme)
      }
      return true
    } catch {
      if (prev) set({ settings: prev })
      return false
    }
  },

  askConfirm: (req) =>
    new Promise<boolean>((resolve) => {
      set({
        confirm: {
          ...req,
          resolve: (v) => resolve(v === true)
        }
      })
    }),

  askPrompt: (req) =>
    new Promise<string | null>((resolve) => {
      set({
        confirm: {
          ...req,
          promptDefault: req.promptDefault ?? '',
          resolve: (v) => resolve(typeof v === 'string' ? v : null)
        }
      })
    }),

  resolveConfirm: (value) => {
    const pending = get().confirm
    set({ confirm: null })
    pending?.resolve(value)
  },

  selectFile: (id, mode) => {
    const { selectedIds, anchorId } = get()
    if (mode === 'toggle') {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
      set({ selectedIds: next, anchorId: id, focusedId: id })
      return
    }
    if (mode === 'range' && anchorId) {
      const ids = get()
        .getVisibleFiles()
        .map((f) => f.id)
      const a = ids.indexOf(anchorId)
      const b = ids.indexOf(id)
      if (a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a]
        set({ selectedIds: ids.slice(from, to + 1), focusedId: id })
        return
      }
    }
    set({ selectedIds: [id], anchorId: id, focusedId: id })
  },

  selectAll: () => {
    const ids = get()
      .getVisibleFiles()
      .map((f) => f.id)
    set({ selectedIds: ids, anchorId: ids[0] ?? null })
  },

  clearSelection: () => set({ selectedIds: [], anchorId: null }),

  setFocused: (id) => set({ focusedId: id }),

  getVisibleFiles: () => {
    const { files, activeShelfId, searchQuery, filter, settings } = get()
    let result = files

    if (activeShelfId) {
      result = result.filter((f) => f.shelfId === activeShelfId)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q) ||
          f.absolutePath.toLowerCase().includes(q) ||
          (q === 'pinned' && f.isPinned)
      )
    }

    if (filter !== 'all') {
      result = result.filter((f) => matchesFilter(f, filter))
    }

    const sort = settings?.fileSort ?? 'added'
    result = [...result].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        case 'recent':
          return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0) || b.addedAt - a.addedAt
        case 'size':
          return b.size - a.size
        case 'added':
        default:
          return b.addedAt - a.addedAt
      }
    })

    return result
  }
}))
