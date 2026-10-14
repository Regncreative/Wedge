import type { KeyboardEvent } from 'react'
import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Package } from 'lucide-react'
import { FileCard } from './file-card'
import { DropFooter } from './drop-footer'
import { SelectionBar } from './selection-bar'
import { useSelectionActions } from '@/hooks/use-selection-actions'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

/** Card ~72px + 8px gap */
const ITEM_HEIGHT = 80
const OVERSCAN = 5

export function FileList() {
  const t = useT()
  const getVisibleFiles = useStashStore((s) => s.getVisibleFiles)
  const files = useStashStore((s) => s.files)
  const searchQuery = useStashStore((s) => s.searchQuery)
  const filter = useStashStore((s) => s.filter)
  const activeShelfId = useStashStore((s) => s.activeShelfId)
  const dropActive = useStashStore((s) => s.dropActive)
  const fileSort = useStashStore((s) => s.settings?.fileSort)
  const contentMatches = useStashStore((s) => s.contentMatches)
  const { removeSelected, pinSelected, openFocused } = useSelectionActions()

  const visible = useMemo(
    () => getVisibleFiles(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, searchQuery, contentMatches, filter, activeShelfId, fileSort, getVisibleFiles]
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(400)
  const [scrolling, setScrolling] = useState(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRaf = useRef<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setHeight(entries[0]?.contentRect.height ?? 400)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
      setScrollTop(0)
    }
  }, [activeShelfId, filter, searchQuery])

  useEffect(() => {
    return () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    }
  }, [])

  const onScroll = useCallback(() => {
    setScrolling(true)
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => setScrolling(false), 150)

    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    scrollRaf.current = requestAnimationFrame(() => {
      setScrollTop(containerRef.current?.scrollTop ?? 0)
    })
  }, [])

  /** Scroll a row into the virtual window, then move DOM focus to it. */
  const focusRow = useCallback(
    (index: number) => {
      const el = containerRef.current
      const file = visible[index]
      if (!el || !file) return
      const top = index * ITEM_HEIGHT
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + ITEM_HEIGHT > el.scrollTop + el.clientHeight) {
        el.scrollTop = top + ITEM_HEIGHT - el.clientHeight
      }
      setScrollTop(el.scrollTop)
      // The row may only mount after the scroll re-render.
      requestAnimationFrame(() => {
        const row = el.querySelector<HTMLElement>(`[data-file-id="${CSS.escape(file.id)}"]`)
        row?.focus({ preventScroll: true })
      })
    },
    [visible]
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (visible.length === 0) return
    const store = useStashStore.getState()
    const current = visible.findIndex((f) => f.id === store.focusedId)
    const pageSize = Math.max(1, Math.floor(height / ITEM_HEIGHT) - 1)

    const moveTo = (target: number) => {
      e.preventDefault()
      const index = Math.max(0, Math.min(visible.length - 1, target))
      store.selectFile(visible[index].id, e.shiftKey ? 'range' : 'single')
      focusRow(index)
    }

    const ctrl = e.ctrlKey || e.metaKey
    switch (e.key) {
      case 'ArrowDown':
        return moveTo(current < 0 ? 0 : current + 1)
      case 'ArrowUp':
        return moveTo(current < 0 ? 0 : current - 1)
      case 'PageDown':
        return moveTo(current + pageSize)
      case 'PageUp':
        return moveTo(current - pageSize)
      case 'Home':
        return moveTo(0)
      case 'End':
        return moveTo(visible.length - 1)
      case 'Enter':
        e.preventDefault()
        void openFocused()
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
        void removeSelected()
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
        } else if (!ctrl && e.key.toLowerCase() === 'p') {
          e.preventDefault()
          void pinSelected()
        }
    }
  }

  const totalHeight = visible.length * ITEM_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(
    visible.length,
    Math.ceil((scrollTop + height) / ITEM_HEIGHT) + OVERSCAN
  )
  const slice = visible.slice(startIndex, endIndex)

  if (visible.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center px-8 pt-10">
          <motion.div
            key={`${activeShelfId}-${filter}-${searchQuery}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center text-center"
          >
            <div
              className={cn(
                'mb-3.5 flex h-14 w-14 items-center justify-center rounded-[16px] transition-colors duration-150',
                dropActive ? 'bg-[var(--accent-soft)]' : 'bg-[var(--pill)]'
              )}
            >
              <Package
                size={26}
                strokeWidth={1.5}
                className={dropActive ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]'}
              />
            </div>
            <p className="text-[15px] font-semibold text-[var(--foreground)]">
              {searchQuery || filter !== 'all' ? t.noMatch : t.emptyTitle}
            </p>
            <p className="mt-2 max-w-[220px] text-[13px] leading-snug text-[var(--muted-foreground)]">
              {searchQuery || filter !== 'all' ? t.trySearch : t.emptyHint}
            </p>
          </motion.div>
        </div>
        <DropFooter />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className={cn(
          'scroll-autohide min-h-0 flex-1 overflow-y-auto overflow-x-hidden',
          scrolling && 'is-scrolling'
        )}
        role="listbox"
        aria-multiselectable
        aria-label={t.filesListLabel}
        onKeyDown={onKeyDown}
      >
        <div style={{ height: totalHeight, position: 'relative', overflow: 'clip' }}>
          {slice.map((file, i) => {
            const index = startIndex + i
            return (
              <div
                key={file.id}
                style={{
                  position: 'absolute',
                  top: index * ITEM_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ITEM_HEIGHT,
                  overflow: 'hidden'
                }}
              >
                <FileCard file={file} index={index} allowPreview={!scrolling} />
              </div>
            )
          })}
        </div>
      </div>
      <SelectionBar />
      <DropFooter />
    </div>
  )
}
