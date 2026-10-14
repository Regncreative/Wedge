import { motion } from 'framer-motion'
import { Archive, MoreHorizontal, Pin, Trash2, X } from 'lucide-react'
import { useStashStore } from '@/stores/stash-store'
import { useSelectionActions } from '@/hooks/use-selection-actions'
import { useT } from '@/lib/i18n'

/** Shown while two or more files are selected. */
export function SelectionBar() {
  const t = useT()
  const count = useStashStore((s) => s.selectedIds.length)
  const clearSelection = useStashStore((s) => s.clearSelection)
  const openContextMenu = useStashStore((s) => s.openContextMenu)
  const refresh = useStashStore((s) => s.refresh)
  const showToast = useStashStore((s) => s.showToast)
  const { removeSelected, pinSelected } = useSelectionActions()

  if (count < 2) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="mx-5 mb-2 mt-1 flex h-11 shrink-0 items-center gap-1 rounded-[14px] border border-[var(--accent)] bg-[var(--accent-soft)] pl-3.5 pr-1.5"
      role="toolbar"
      aria-label={t.selectedCount(count)}
    >
      <span className="flex-1 text-[13px] font-medium text-[var(--foreground)]">
        {t.selectedCount(count)}
      </span>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pill-hover)]"
        onClick={() => void pinSelected()}
      >
        <Pin size={14} strokeWidth={1.75} />
        {t.pinSelected}
      </button>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pill-hover)]"
        onClick={async () => {
          const res = await window.stash.zipFiles(useStashStore.getState().selectedIds)
          await refresh()
          if (res.ok) showToast(t.zipDone)
        }}
      >
        <Archive size={14} strokeWidth={1.75} />
        ZIP
      </button>
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-medium text-[var(--destructive)] transition-colors hover:bg-[var(--pill-hover)]"
        onClick={() => void removeSelected()}
      >
        <Trash2 size={14} strokeWidth={1.75} />
        {t.remove}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.more}
        title={t.more}
        onClick={(e) => {
          const first = useStashStore.getState().selectedIds[0]
          const rect = e.currentTarget.getBoundingClientRect()
          // Open upwards from the bar.
          if (first) openContextMenu(rect.left - 180, Math.max(8, rect.top - 420), first)
        }}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.clearSelection}
        onClick={clearSelection}
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </motion.div>
  )
}
