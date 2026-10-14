import { create } from 'zustand'
import type { AppSettings, FileFilter, Shelf, ShelfStats, StashFile } from '@shared/types'
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

export type ViewMode = 'list' | 'grid'

const VIEW_KEY = 'stash.viewMode'

function storedViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
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

export interface Toast {
  id: number
  message: string
  /** Shows a spinner and stays until replaced. */
  busy?: boolean
}

interface StashState {
  ready: boolean
  shelves: Shelf[]
  files: StashFile[]
  stats: ShelfStats
  settings: AppSettings | null
  appVersion: string
  activeShelfId: string | null
  /** The "All" view: every shelf at once. */
  allFiles: boolean
  viewMode: ViewMode
  searchQuery: string
  /** Files whose contents match the search (from the backend index). */
  contentMatches: Set<string>
  /** File shown in the Quick Look overlay. */
  quickLookId: string | null
  shelfMenu: { x: number; y: number; shelfId: string } | null
  addMenu: { x: number; y: number } | null
  sharedDialog: boolean
  phoneOpen: boolean
  /** File whose note and tags are being edited. */
  noteFileId: string | null
  filter: FileFilter
  showSettings: boolean
  theme: 'light' | 'dark'
  toast: Toast | null
  contextMenu: { x: number; y: number; fileId: string } | null
  /** Files from outside are being dragged over the panel. */
  dropActive: boolean
  /** Rail shelf under the cursor during a drag (outside files or our own). */
  dropTarget: string | null
  confirm: PendingConfirm | null
  /** Multi-selection (Ctrl/Shift+click, keyboard), in selection order. */
  selectedIds: string[]
  /** Fixed end of a Shift range. */
  anchorId: string | null
  /** Row with keyboard focus (roving tabindex). */
  focusedId: string | null

  init: () => Promise<void>
  refresh: () => Promise<void>
  setActiveShelf: (id: string) => void
  showAll: () => void
  setViewMode: (mode: ViewMode) => void
  setSearch: (q: string) => void
  openQuickLook: (id: string | null) => void
  openShelfMenu: (x: number, y: number, shelfId: string) => void
  closeShelfMenu: () => void
  openAddMenu: (x: number, y: number) => void
  closeAddMenu: () => void
  setSharedDialog: (open: boolean) => void
  setPhoneOpen: (open: boolean) => void
  editNote: (id: string | null) => void
  setFilter: (f: FileFilter) => void
  setShowSettings: (v: boolean) => void
  resetPanelUi: () => void
  setTheme: (t: 'light' | 'dark') => void
  showToast: (message: string, busy?: boolean) => void
  clearToast: () => void
  openContextMenu: (x: number, y: number, fileId: string) => void
  closeContextMenu: () => void
  setDropActive: (v: boolean) => void
  setDropTarget: (id: string | null) => void
  /** Resolves false when the backend rejected the change (it is rolled back). */
  updateSettings: (partial: Partial<AppSettings>) => Promise<boolean>
  getVisibleFiles: () => StashFile[]
  /** The shelf new files go to from the current view. */
  dropShelfId: () => string | null
  askConfirm: (req: ConfirmRequest) => Promise<boolean>
  askPrompt: (req: ConfirmRequest) => Promise<string | null>
  resolveConfirm: (value: string | boolean | null) => void
  selectFile: (id: string, mode: 'single' | 'toggle' | 'range') => void
  selectAll: () => void
  clearSelection: () => void
  setFocused: (id: string | null) => void
}

let contentTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced full-text search over file contents (backend index). */
function scheduleContentSearch(q: string, done: (ids: string[]) => void): void {
  if (contentTimer) clearTimeout(contentTimer)
  if (q.trim().length < 2) {
    done([])
    return
  }
  contentTimer = setTimeout(() => {
    void window.stash
      .searchContent(q.trim())
      .then(done)
      .catch(() => done([]))
  }, 180)
}

const NO_SELECTION = { selectedIds: [] as string[], anchorId: null, focusedId: null }

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('light', theme === 'light')
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useStashStore = create<StashState>((set, get) => ({
  ready: false,
  shelves: [],
  files: [],
  stats: { shelfCount: 0, fileCount: 0, totalSize: 0 },
  settings: null,
  appVersion: '',
  activeShelfId: null,
  allFiles: false,
  viewMode: storedViewMode(),
  searchQuery: '',
  contentMatches: new Set<string>(),
  quickLookId: null,
  shelfMenu: null,
  addMenu: null,
  sharedDialog: false,
  phoneOpen: false,
  noteFileId: null,
  filter: 'all',
  showSettings: false,
  theme: 'dark',
  toast: null,
  contextMenu: null,
  dropActive: false,
  dropTarget: null,
  confirm: null,
  selectedIds: [],
  anchorId: null,
  focusedId: null,

  init: async () => {
    const [shelves, settings, systemTheme, appVersion] = await Promise.all([
      window.stash.listShelves(),
      window.stash.getSettings(),
      window.stash.getSystemTheme(),
      window.stash.getAppVersion()
    ])

    const theme = settings.theme === 'system' ? systemTheme : settings.theme
    document.documentElement.style.setProperty('--accent', settings.accentColor)
    applyTheme(theme)
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
      theme,
      showSettings: false
    })
    void window.stash.appReady()
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
    set({ activeShelfId: id, allFiles: false, showSettings: false, filter: 'all', ...NO_SELECTION })
    void get().updateSettings({ lastShelfId: id })
  },
  showAll: () => set({ allFiles: true, showSettings: false, filter: 'all', ...NO_SELECTION }),
  setViewMode: (mode) => {
    try {
      localStorage.setItem(VIEW_KEY, mode)
    } catch {
      // Private mode or blocked storage: the choice just isn't remembered.
    }
    set({ viewMode: mode })
  },
  setSearch: (q) => {
    set({ searchQuery: q, ...NO_SELECTION })
    scheduleContentSearch(q, (ids) => {
      // Ignore results for a query that has since changed.
      if (get().searchQuery === q) set({ contentMatches: new Set(ids) })
    })
  },
  openQuickLook: (id) => set({ quickLookId: id, contextMenu: null }),
  openShelfMenu: (x, y, shelfId) =>
    set({ shelfMenu: { x, y, shelfId }, contextMenu: null, addMenu: null }),
  closeShelfMenu: () => set({ shelfMenu: null }),
  openAddMenu: (x, y) => set({ addMenu: { x, y }, contextMenu: null, shelfMenu: null }),
  closeAddMenu: () => set({ addMenu: null }),
  setSharedDialog: (open) => set({ sharedDialog: open, addMenu: null }),
  setPhoneOpen: (open) => set({ phoneOpen: open }),
  editNote: (id) => set({ noteFileId: id, contextMenu: null }),
  setFilter: (f) => set({ filter: f, ...NO_SELECTION }),

  setShowSettings: (v) => set({ showSettings: v, contextMenu: null, shelfMenu: null }),
  resetPanelUi: () => {
    const pending = get().confirm
    set({
      contextMenu: null,
      shelfMenu: null,
      addMenu: null,
      confirm: null,
      searchQuery: '',
      dropActive: false,
      dropTarget: null,
      ...NO_SELECTION
    })
    pending?.resolve(false)
  },
  setTheme: (t) => {
    applyTheme(t)
    set({ theme: t })
  },

  showToast: (message, busy) => set({ toast: { message, busy, id: Date.now() } }),
  clearToast: () => set({ toast: null }),

  openContextMenu: (x, y, fileId) =>
    set({ contextMenu: { x, y, fileId }, shelfMenu: null, addMenu: null }),
  closeContextMenu: () => set({ contextMenu: null }),
  setDropActive: (v) => set(v ? { dropActive: true } : { dropActive: false, dropTarget: null }),
  setDropTarget: (id) => {
    if (get().dropTarget !== id) set({ dropTarget: id })
  },

  updateSettings: async (partial) => {
    const prev = get().settings
    // Optimistic update so toggles apply immediately.
    if (prev) set({ settings: normalizeSettings({ ...prev, ...partial }) })
    try {
      const next = normalizeSettings(await window.stash.setSettings(partial))
      set({ settings: next })
      if (partial.accentColor) {
        document.documentElement.style.setProperty('--accent', partial.accentColor)
      }
      if (partial.theme) {
        const systemTheme = await window.stash.getSystemTheme()
        get().setTheme(partial.theme === 'system' ? systemTheme : partial.theme)
      }
      return true
    } catch {
      if (prev) set({ settings: prev })
      return false
    }
  },

  askConfirm: (req) =>
    new Promise<boolean>((resolve) => {
      set({ confirm: { ...req, resolve: (v) => resolve(v === true) } })
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

  dropShelfId: () => {
    const { allFiles, activeShelfId, settings, shelves } = get()
    if (!allFiles && activeShelfId) return activeShelfId
    return pickShelfId(settings?.defaultShelfId, shelves)
  },

  getVisibleFiles: () => {
    const { files, activeShelfId, allFiles, searchQuery, filter, settings, contentMatches } = get()
    const q = searchQuery.trim().toLowerCase()
    let result = files

    // Search looks across every shelf.
    if (!q && !allFiles && activeShelfId) {
      result = result.filter((f) => f.shelfId === activeShelfId)
    }

    if (q) {
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q) ||
          f.absolutePath.toLowerCase().includes(q) ||
          f.note.toLowerCase().includes(q) ||
          f.tags.toLowerCase().includes(q) ||
          contentMatches.has(f.id)
      )
    }

    if (filter !== 'all') {
      result = result.filter((f) => matchesFilter(f, filter))
    }

    const sort = settings?.fileSort ?? 'added'
    return [...result].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
        case 'recent':
          return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0) || b.addedAt - a.addedAt
        case 'size':
          return b.size - a.size
        case 'added':
        default:
          return b.addedAt - a.addedAt
      }
    })
  }
}))
