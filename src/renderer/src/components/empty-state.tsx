import { motion } from 'framer-motion'
import { SearchX } from 'lucide-react'
import { ShelfIcon } from './file-icon'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

export function EmptyState() {
  const t = useT()
  const searchQuery = useStashStore((s) => s.searchQuery)
  const filter = useStashStore((s) => s.filter)
  const shelf = useStashStore((s) => s.shelves.find((x) => x.id === s.activeShelfId))

  const noMatch = searchQuery.trim() !== '' || filter !== 'all'
  const pocket = shelf?.kind === 'pocket'
  const title = noMatch ? t.noMatch : pocket ? t.pocketEmptyTitle : t.emptyTitle
  const hint = noMatch
    ? t.trySearch
    : pocket
      ? t.pocketEmptyHint
      : shelf?.folder
        ? t.emptySharedHint
        : t.emptyEdgeHint

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-16">
      <motion.div
        key={`${noMatch}-${shelf?.id}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex max-w-[280px] flex-col items-center text-center"
      >
        <div className="mb-4 flex h-[84px] w-[120px] items-center justify-center rounded-2xl border-[1.5px] border-dashed border-[var(--stroke-strong)] text-[var(--fg-3)]">
          {noMatch ? (
            <SearchX size={26} strokeWidth={1.5} />
          ) : (
            <ShelfIcon name={shelf?.icon ?? 'folder'} size={26} />
          )}
        </div>
        <p className="display-font text-[18px] font-bold text-[var(--fg)]">{title}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-3)]">{hint}</p>
      </motion.div>
    </div>
  )
}
