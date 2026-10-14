import type { MouseEvent, ReactNode } from 'react'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Clock, LayoutGrid, Plus, Settings, Smartphone, Users } from 'lucide-react'
import type { Shelf } from '@shared/types'
import { ShelfIcon } from './file-icon'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

/** The app mark: three stacked shelves. */
export function StashMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[30%]"
      style={{
        width: size,
        height: size,
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--accent) 80%, white) 0%, var(--accent) 100%)'
      }}
      aria-hidden
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2.5" width="12" height="2.4" rx="1" fill="white" />
        <rect x="2" y="6.8" width="12" height="2.4" rx="1" fill="white" opacity="0.82" />
        <rect x="2" y="11.1" width="8.5" height="2.4" rx="1" fill="white" opacity="0.6" />
      </svg>
    </div>
  )
}

function Badge({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span className="absolute -right-1.5 -top-1 min-w-[16px] rounded-full bg-[var(--bg-solid)] px-1 text-center text-[9.5px] font-semibold leading-[16px] text-[var(--fg-2)] shadow-[0_0_0_1px_var(--stroke-strong)]">
      {n > 99 ? '99+' : n}
    </span>
  )
}

interface RailItemProps {
  label: string
  title: string
  active: boolean
  target?: boolean
  count?: number
  color: string
  icon: ReactNode
  corner?: ReactNode
  onClick: () => void
  onContextMenu?: (e: MouseEvent) => void
  dropShelf?: string
}

function RailItem(p: RailItemProps) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      onContextMenu={p.onContextMenu}
      title={p.title}
      aria-label={p.title}
      aria-current={p.active ? 'page' : undefined}
      data-drop-shelf={p.dropShelf}
      className="group relative flex w-[60px] shrink-0 flex-col items-center gap-[3px] rounded-lg pb-1.5 pt-1.5 outline-none"
    >
      {p.active && (
        <motion.span
          layoutId="rail-indicator"
          className="absolute left-0 top-[14px] h-[18px] w-[3px] rounded-full bg-[var(--accent)]"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      <span
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-[10px] transition-all duration-150',
          'group-hover:brightness-110 group-active:scale-95',
          p.target && 'scale-110 ring-2 ring-[var(--accent)]'
        )}
        style={{
          background: p.active
            ? `color-mix(in srgb, ${p.color} 30%, transparent)`
            : `color-mix(in srgb, ${p.color} 15%, transparent)`
        }}
      >
        {p.icon}
        {p.count !== undefined && <Badge n={p.count} />}
        {p.corner && (
          <span className="absolute -bottom-1 -right-1 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[var(--bg-solid)] text-[var(--fg-2)] shadow-[0_0_0_1px_var(--stroke-strong)]">
            {p.corner}
          </span>
        )}
      </span>
      <span
        className={cn(
          'w-full truncate px-0.5 text-center text-[10.5px] leading-tight transition-colors',
          p.active
            ? 'font-semibold text-[var(--fg)]'
            : 'text-[var(--fg-3)] group-hover:text-[var(--fg-2)]'
        )}
        aria-hidden
      >
        {p.label}
      </span>
    </button>
  )
}

/** The shelf rail: All, every shelf (also drop targets), new shelf, phone, settings. */
export function Rail() {
  const t = useT()
  const shelves = useStashStore((s) => s.shelves)
  const files = useStashStore((s) => s.files)
  const activeShelfId = useStashStore((s) => s.activeShelfId)
  const allFiles = useStashStore((s) => s.allFiles)
  const showSettings = useStashStore((s) => s.showSettings)
  const dropTarget = useStashStore((s) => s.dropTarget)
  const setActiveShelf = useStashStore((s) => s.setActiveShelf)
  const showAll = useStashStore((s) => s.showAll)
  const openShelfMenu = useStashStore((s) => s.openShelfMenu)
  const openAddMenu = useStashStore((s) => s.openAddMenu)
  const setShowSettings = useStashStore((s) => s.setShowSettings)
  const setPhoneOpen = useStashStore((s) => s.setPhoneOpen)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of files) m.set(f.shelfId, (m.get(f.shelfId) ?? 0) + 1)
    return m
  }, [files])

  const corner = (s: Shelf) =>
    s.folder ? (
      <Users size={9} strokeWidth={2.25} />
    ) : s.expireHours ? (
      <Clock size={9} strokeWidth={2.25} />
    ) : null

  return (
    <nav
      aria-label={t.railLabel}
      className="flex w-[68px] shrink-0 flex-col items-center border-r border-[var(--stroke)] bg-[var(--rail)] pt-3"
    >
      <div className="mb-2.5">
        <StashMark size={26} />
      </div>

      <RailItem
        label={t.allFiles}
        title={`${t.allFiles} · ${t.filesCount(files.length)}`}
        active={allFiles && !showSettings}
        color="var(--fg-2)"
        icon={<LayoutGrid size={17} strokeWidth={1.75} className="text-[var(--fg-2)]" />}
        onClick={showAll}
      />
      <div className="mx-auto my-1.5 h-px w-8 bg-[var(--stroke)]" />

      <div className="no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden px-1">
        {shelves.map((shelf) => (
          <RailItem
            key={shelf.id}
            label={shelf.name}
            title={`${shelf.name} · ${t.filesCount(counts.get(shelf.id) ?? 0)}`}
            active={!allFiles && !showSettings && activeShelfId === shelf.id}
            target={dropTarget === shelf.id}
            count={counts.get(shelf.id) ?? 0}
            color={shelf.color}
            icon={<ShelfIcon name={shelf.icon} color={shelf.color} size={18} />}
            corner={corner(shelf)}
            dropShelf={shelf.id}
            onClick={() => setActiveShelf(shelf.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              openShelfMenu(e.clientX, e.clientY, shelf.id)
            }}
          />
        ))}
        <button
          type="button"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[var(--fg-3)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
          style={{ boxShadow: 'inset 0 0 0 1px var(--stroke-strong)' }}
          aria-label={t.createShelf}
          title={t.createShelf}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openAddMenu(r.right + 6, r.top)
          }}
        >
          <Plus size={17} strokeWidth={1.75} />
        </button>
        <div className="h-2 shrink-0" />
      </div>

      <div className="flex w-full flex-col items-center gap-1 border-t border-[var(--stroke)] py-2.5">
        <button
          type="button"
          className="btn-icon h-9 w-9"
          aria-label={t.phoneButton}
          title={t.phoneButton}
          onClick={() => setPhoneOpen(true)}
        >
          <Smartphone size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="btn-icon h-9 w-9"
          aria-label={t.settings}
          title={t.settings}
          aria-pressed={showSettings}
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings size={18} strokeWidth={1.75} />
        </button>
      </div>
    </nav>
  )
}
