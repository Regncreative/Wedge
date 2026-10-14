import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine } from 'lucide-react'
import { ShelfIcon } from './file-icon'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

/** Shown over the content while files from outside are dragged over the panel. */
export function DropOverlay() {
  const t = useT()
  const dropActive = useStashStore((s) => s.dropActive)
  const dropTarget = useStashStore((s) => s.dropTarget)
  const shelves = useStashStore((s) => s.shelves)
  const fallback = useStashStore((s) => (s.dropActive ? s.dropShelfId() : null))
  const shelf = shelves.find((s) => s.id === (dropTarget ?? fallback))

  return (
    <AnimatePresence>
      {dropActive && shelf && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          className="pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center rounded-xl"
          style={{
            background: 'color-mix(in srgb, var(--bg-solid) 82%, transparent)',
            boxShadow: 'inset 0 0 0 2px var(--accent)',
            backdropFilter: 'blur(2px)'
          }}
        >
          <motion.div
            key={shelf.id}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex flex-col items-center"
          >
            <span
              className="relative flex h-16 w-16 items-center justify-center rounded-[20px]"
              style={{ background: `color-mix(in srgb, ${shelf.color} 22%, transparent)` }}
            >
              <ShelfIcon name={shelf.icon} color={shelf.color} size={28} />
              <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-card)]">
                <ArrowDownToLine size={15} strokeWidth={2.25} />
              </span>
            </span>
            <p className="display-font mt-4 text-[15px] font-semibold text-[var(--fg)]">
              {t.dropTo(shelf.name)}
            </p>
            {shelf.folder && (
              <p className="mt-1 max-w-[240px] text-center text-[11.5px] text-[var(--fg-3)]">
                {t.emptySharedHint}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
