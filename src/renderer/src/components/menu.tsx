import type { DragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MenuEntry {
  label: string
  icon?: LucideIcon
  danger?: boolean
  disabled?: boolean
  /** Radio item (role="menuitemradio"). */
  checked?: boolean
  /** A color dot shown before the label. */
  swatch?: string
  /** Opens a submenu in place, with a back row. */
  children?: MenuEntry[]
  action?: () => unknown
  /** A draggable row (e.g. "Drag as ZIP"). */
  onDragStart?: (e: DragEvent) => void
  /** Separator above this entry. */
  separated?: boolean
}

interface MenuProps {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
  /** Small caption above the items. */
  caption?: string
  width?: number
}

/**
 * A Fluent-style flyout at a point. Submenus replace the list (with a back
 * row) instead of opening sideways: the panel is narrow.
 */
export function Menu({ x, y, items, onClose, caption, width = 236 }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [stack, setStack] = useState<MenuEntry[]>([])
  const [pos, setPos] = useState({ left: x, top: y })
  const current = stack.length > 0 ? (stack[stack.length - 1].children ?? []) : items

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (stack.length > 0) setStack((s) => s.slice(0, -1))
      else onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose, stack.length])

  // Keep the flyout inside the window (flip above the point if needed).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
    let top = y
    if (top + h > window.innerHeight - 8)
      top = Math.max(8, Math.min(y - h, window.innerHeight - h - 8))
    setPos({ left, top })
  }, [x, y, width, stack.length, current.length])

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus()
  }, [stack.length])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? []
    )
    const i = all.indexOf(document.activeElement as HTMLElement)
    const next = all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]
    next?.focus()
  }

  const run = (entry: MenuEntry) => {
    if (entry.children) {
      setStack((s) => [...s, entry])
      return
    }
    onClose()
    void entry.action?.()
  }

  return (
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flyout scroll-autohide fixed z-[70] max-h-[calc(100%-16px)] overflow-y-auto"
      style={{ left: pos.left, top: pos.top, width }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {stack.length > 0 ? (
        <button
          type="button"
          className="menu-item font-semibold"
          onClick={() => setStack((s) => s.slice(0, -1))}
        >
          <ChevronLeft size={15} strokeWidth={2} className="text-[var(--fg-3)]" />
          <span className="truncate">{stack[stack.length - 1].label}</span>
        </button>
      ) : caption ? (
        <div className="px-3.5 pb-1 pt-1.5 text-[11px] font-semibold text-[var(--fg-3)]">
          {caption}
        </div>
      ) : null}
      {stack.length > 0 && <div className="my-1 border-t border-[var(--stroke)]" />}
      {current.map((entry) => (
        <div key={entry.label}>
          {entry.separated && <div className="my-1 border-t border-[var(--stroke)]" />}
          {entry.onDragStart ? (
            <div
              role="menuitem"
              tabIndex={-1}
              draggable={!entry.disabled}
              onDragStart={entry.onDragStart}
              aria-disabled={entry.disabled}
              className={cn('menu-item cursor-grab', entry.disabled && 'opacity-40')}
            >
              {entry.icon && (
                <entry.icon size={15} strokeWidth={1.75} className="text-[var(--fg-2)]" />
              )}
              <span className="flex-1 truncate">{entry.label}</span>
            </div>
          ) : (
            <button
              type="button"
              role={entry.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={entry.checked}
              aria-haspopup={entry.children ? 'menu' : undefined}
              disabled={entry.disabled}
              onClick={() => run(entry)}
              className={cn('menu-item', entry.danger && 'text-[var(--danger)]')}
            >
              {entry.checked !== undefined ? (
                <Check
                  size={15}
                  strokeWidth={2}
                  className={cn('text-[var(--accent-text)]', !entry.checked && 'invisible')}
                />
              ) : entry.icon ? (
                <entry.icon
                  size={15}
                  strokeWidth={1.75}
                  className={entry.danger ? 'text-[var(--danger)]' : 'text-[var(--fg-2)]'}
                />
              ) : null}
              {entry.swatch && (
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
                  style={{ background: entry.swatch }}
                />
              )}
              <span className="flex-1 truncate">{entry.label}</span>
              {entry.children && (
                <ChevronRight size={14} strokeWidth={1.75} className="text-[var(--fg-3)]" />
              )}
            </button>
          )}
        </div>
      ))}
    </motion.div>
  )
}
