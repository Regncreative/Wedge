import { motion } from 'framer-motion'
import { ArrowDownToLine, SearchX, Users } from 'lucide-react'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

export function EmptyState() {
  const t = useT()
  const searchQuery = useStashStore((s) => s.searchQuery)
  const filter = useStashStore((s) => s.filter)
  const allFiles = useStashStore((s) => s.allFiles)
  const shelf = useStashStore((s) => s.shelves.find((x) => x.id === s.activeShelfId))
  const dropActive = useStashStore((s) => s.dropActive)

  const noMatch = searchQuery.trim() !== '' || filter !== 'all'
  const shared = !allFiles && Boolean(shelf?.folder)
  const Icon = noMatch ? SearchX : shared ? Users : ArrowDownToLine

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-10">
      <motion.div
        key={`${noMatch}-${shelf?.id}-${allFiles}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex max-w-[260px] flex-col items-center text-center"
      >
        <div
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] transition-colors"
          style={{
            background: dropActive
              ? 'var(--accent-soft)'
              : 'color-mix(in srgb, var(--accent) 9%, transparent)',
            boxShadow: noMatch ? undefined : 'inset 0 0 0 1.5px var(--accent-soft)'
          }}
        >
          <Icon size={28} strokeWidth={1.5} className="text-[var(--accent-text)]" />
        </div>
        <p className="display-font text-[15px] font-semibold text-[var(--fg)]">
          {noMatch ? t.noMatch : allFiles ? t.emptyAllTitle : t.emptyTitle}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--fg-3)]">
          {noMatch ? t.trySearch : shared ? t.emptySharedHint : t.emptyHint}
        </p>
        {!noMatch && (
          <div
            className="mt-4 flex items-center gap-1.5 text-[11px] text-[var(--fg-3)]"
            aria-hidden
          >
            <kbd className="rounded-[5px] px-1.5 py-0.5 font-sans shadow-[inset_0_0_0_1px_var(--stroke-strong)]">
              Ctrl
            </kbd>
            <span>+</span>
            <kbd className="rounded-[5px] px-1.5 py-0.5 font-sans shadow-[inset_0_0_0_1px_var(--stroke-strong)]">
              V
            </kbd>
          </div>
        )}
      </motion.div>
    </div>
  )
}
