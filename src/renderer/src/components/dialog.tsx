import type { KeyboardEvent, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface DialogProps {
  labelledBy: string
  onClose?: () => void
  children: ReactNode
  className?: string
  z?: number
  onKeyDown?: (e: KeyboardEvent) => void
}

/** A modal card over the panel, closed by clicking the backdrop. */
export function Dialog({
  labelledBy,
  onClose,
  children,
  className,
  z = 80,
  onKeyDown
}: DialogProps) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-5"
      style={{ zIndex: z, background: 'var(--scrim)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      onKeyDown={onKeyDown}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        className={cn('flyout w-full max-w-[360px] rounded-2xl p-5', className)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
