import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useStashStore } from '@/stores/stash-store'

export function Toast() {
  const toast = useStashStore((s) => s.toast)
  const clearToast = useStashStore((s) => s.clearToast)
  const selecting = useStashStore((s) => s.selectedIds.length >= 2)

  useEffect(() => {
    if (!toast || toast.busy) return
    const timer = setTimeout(clearToast, 3200)
    return () => clearTimeout(timer)
  }, [toast, clearToast])

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-[60] flex justify-center px-5"
      style={{ bottom: selecting ? 64 : 14 }}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            role="status"
            className="flyout flex max-w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] leading-snug text-[var(--fg)]"
          >
            {toast.busy && (
              <Loader2
                size={14}
                strokeWidth={2}
                className="shrink-0 animate-spin text-[var(--accent-text)]"
              />
            )}
            <span className="break-words">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
