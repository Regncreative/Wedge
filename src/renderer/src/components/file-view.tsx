import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileRow, FileTile } from './file-item'
import { EmptyState } from './empty-state'
import { openFile, pinFiles, removeFiles } from '@/lib/file-actions'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const ROW_HEIGHT = 58
const TILE_HEIGHT = 140
const TILE_MIN_WIDTH = 112
const PAD = 8
const OVERSCAN = 4

/** The files of the current view, as a virtualized list or grid. */
export function FileView() {
  const t = useT()
  const getVisibleFiles = useStashStore((s) => s.getVisibleFiles)
  const files = useStashStore((s) => s.files)
  const shelves = useStashStore((s) => s.shelves)
  const searchQuery = useStashStore((s) => s.searchQuery)
  const filter = useStashStore((s) => s.filter)
  const activeShelfId = useStashStore((s) => s.activeShelfId)
  const allFiles = useStashStore((s) => s.allFiles)
  const fileSort = useStashStore((s) => s.settings?.fileSort)
  const contentMatches = useStashStore((s) => s.contentMatches)
  const viewMode = useStashStore((s) => s.viewMode)

  const visible = useMemo(
    () => getVisibleFiles(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, searchQuery, contentMatches, filter, activeShelfId, allFiles, fileSort, getVisibleFiles]
  )
  const spansShelves = allFiles || searchQuery.trim() !== ''
  const shelfNames = useMemo(() => new Map(shelves.map((s) => [s.id, s.name])), [shelves])

  const empty = visible.length === 0
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [size, setSize] = useState({ width: 380, height: 400 })
  const [scrolling, setScrolling] = useState(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [empty])

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
    setScrollTop(0)
  }, [activeShelfId, allFiles, filter, searchQuery, viewMode])

  const grid = viewMode === 'grid'
  const columns = grid ? Math.max(2, Math.floor((size.width - PAD * 2) / TILE_MIN_WIDTH)) : 1
  const itemHeight = grid ? TILE_HEIGHT : ROW_HEIGHT
  const rows = Math.ceil(visible.length / columns)
  const cellWidth = (size.width - PAD * 2) / columns

  const onScroll = useCallback(() => {
    setScrolling(true)
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => setScrolling(false), 150)
    setScrollTop(containerRef.current?.scrollTop ?? 0)
  }, [])

  /** Scroll an item into the virtual window, then move DOM focus to it. */
  const focusItem = useCallback(
    (index: number) => {
      const el = containerRef.current
      const file = visible[index]
      if (!el || !file) return
      const top = Math.floor(index / columns) * itemHeight + PAD
      if (top < el.scrollTop) el.scrollTop = top - PAD
      else if (top + itemHeight > el.scrollTop + el.clientHeight) {
        el.scrollTop = top + itemHeight - el.clientHeight + PAD
      }
      setScrollTop(el.scrollTop)
      requestAnimationFrame(() => {
        el.querySelector<HTMLElement>(`[data-file-id="${CSS.escape(file.id)}"]`)?.focus({
          preventScroll: true
        })
      })
    },
    [visible, columns, itemHeight]
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (visible.length === 0) return
    const store = useStashStore.getState()
    const current = visible.findIndex((f) => f.id === store.focusedId)
    const pageSize = Math.max(1, Math.floor(size.height / itemHeight) - 1) * columns
    const moveTo = (target: number) => {
      e.preventDefault()
      const index = Math.max(0, Math.min(visible.length - 1, target))
      store.selectFile(visible[index].id, e.shiftKey ? 'range' : 'single')
      focusItem(index)
    }
    const ctrl = e.ctrlKey || e.metaKey
    const from = current < 0 ? 0 : current
    switch (e.key) {
      case 'ArrowDown':
        return moveTo(current < 0 ? 0 : from + columns)
      case 'ArrowUp':
        return moveTo(current < 0 ? 0 : from - columns)
      case 'ArrowRight':
        if (grid) return moveTo(current < 0 ? 0 : from + 1)
        return
      case 'ArrowLeft':
        if (grid) return moveTo(current < 0 ? 0 : from - 1)
        return
      case 'PageDown':
        return moveTo(from + pageSize)
      case 'PageUp':
        return moveTo(from - pageSize)
      case 'Home':
        return moveTo(0)
      case 'End':
        return moveTo(visible.length - 1)
      case 'Enter':
        e.preventDefault()
        if (store.focusedId) void openFile(store.focusedId)
        return
      case ' ':
        // Space previews (Quick Look); Ctrl+Space toggles selection.
        if (store.focusedId) {
          e.preventDefault()
          if (ctrl) store.selectFile(store.focusedId, 'toggle')
          else store.openQuickLook(store.focusedId)
        }
        return
      case 'Delete':
        e.preventDefault()
        void removeFiles(store.selectedIds)
        return
      case 'Escape':
        if (store.selectedIds.length > 0) {
          e.stopPropagation()
          store.clearSelection()
        }
        return
      default:
        if (ctrl && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          store.selectAll()
        } else if (!ctrl && !e.altKey && e.key.toLowerCase() === 'p') {
          e.preventDefault()
          void pinFiles(store.selectedIds)
        }
    }
  }

  if (empty) return <EmptyState />

  const firstRow = Math.max(0, Math.floor((scrollTop - PAD) / itemHeight) - OVERSCAN)
  const lastRow = Math.min(rows, Math.ceil((scrollTop + size.height) / itemHeight) + OVERSCAN)
  const slice = visible.slice(firstRow * columns, lastRow * columns)

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        // A click on empty space clears the selection.
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.spacer) {
          useStashStore.getState().clearSelection()
        }
      }}
      className={cn(
        'scroll-autohide min-h-0 flex-1 overflow-y-auto overflow-x-hidden',
        scrolling && 'is-scrolling'
      )}
      role="listbox"
      aria-multiselectable
      aria-label={t.filesListLabel}
    >
      <div data-spacer="1" style={{ height: rows * itemHeight + PAD * 2, position: 'relative' }}>
        {slice.map((file, i) => {
          const index = firstRow * columns + i
          const row = Math.floor(index / columns)
          const col = index % columns
          const shelfName = spansShelves ? shelfNames.get(file.shelfId) : undefined
          return (
            <div
              key={file.id}
              style={{
                position: 'absolute',
                top: PAD + row * itemHeight,
                left: grid ? PAD + col * cellWidth : 0,
                width: grid ? cellWidth : '100%',
                height: itemHeight,
                padding: grid ? 3 : 0
              }}
            >
              {grid ? (
                <FileTile file={file} index={index} shelfName={shelfName} />
              ) : (
                <FileRow file={file} index={index} shelfName={shelfName} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
