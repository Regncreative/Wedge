import { AnimatePresence, motion } from 'framer-motion'
import { Archive, MoreHorizontal, Pin, Trash2, X } from 'lucide-react'
import { pinFiles, removeFiles, zipFiles } from '@/lib/file-actions'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

/** Floating actions while two or more files are selected. */
export function SelectionBar() {
  const t = useT()
  const count = useStashStore((s) => s.selectedIds.length)
  const clearSelection = useStashStore((s) => s.clearSelection)
  const openContextMenu = useStashStore((s) => s.openContextMenu)
  const ids = () => useStashStore.getState().selectedIds

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center">
      <AnimatePresence>
        {count >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            className="flyout pointer-events-auto flex items-center gap-0.5 rounded-xl px-1.5 py-1.5"
            role="toolbar"
            aria-label={t.selectedCount(count)}
          >
            <span className="px-2 text-[12.5px] font-semibold tabular-nums text-[var(--fg)]">
              {t.selectedCount(count)}
            </span>
            <div className="mx-0.5 h-5 w-px bg-[var(--stroke-strong)]" />
            <button
              type="button"
              className="menu-item mx-0 w-auto"
              onClick={() => void pinFiles(ids())}
            >
              <Pin size={14} strokeWidth={1.75} />
              {t.pinSelected}
            </button>
            <button
              type="button"
              className="menu-item mx-0 w-auto"
              onClick={() => void zipFiles(ids())}
            >
              <Archive size={14} strokeWidth={1.75} />
              ZIP
            </button>
            <button
              type="button"
              className="menu-item mx-0 w-auto text-[var(--danger)]"
              onClick={() => void removeFiles(ids())}
            >
              <Trash2 size={14} strokeWidth={1.75} />
              {t.remove}
            </button>
            <button
              type="button"
              className="btn-icon h-8 w-8"
              aria-label={t.more}
              title={t.more}
              onClick={(e) => {
                const first = ids()[0]
                const r = e.currentTarget.getBoundingClientRect()
                if (first) openContextMenu(r.left - 100, r.top - 8, first)
              }}
            >
              <MoreHorizontal size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="btn-icon h-8 w-8"
              aria-label={t.clearSelection}
              title={t.clearSelection}
              onClick={clearSelection}
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
