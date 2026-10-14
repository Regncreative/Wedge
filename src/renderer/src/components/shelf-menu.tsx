import type { DragEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ChevronRight,
  Clock,
  ExternalLink,
  MonitorUp,
  Pencil,
  Trash2
} from 'lucide-react'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const EXPIRY_OPTIONS: (number | null)[] = [null, 24, 24 * 7, 24 * 30]

/** Right-click menu for a shelf tab. */
export function ShelfMenu() {
  const t = useT()
  const menu = useStashStore((s) => s.shelfMenu)
  const close = useStashStore((s) => s.closeShelfMenu)
  const shelves = useStashStore((s) => s.shelves)
  const files = useStashStore((s) => s.files)
  const refresh = useStashStore((s) => s.refresh)
  const askPrompt = useStashStore((s) => s.askPrompt)
  const askConfirm = useStashStore((s) => s.askConfirm)
  const showToast = useStashStore((s) => s.showToast)
  const ref = useRef<HTMLDivElement>(null)
  const [expiryOpen, setExpiryOpen] = useState(false)

  useEffect(() => {
    setExpiryOpen(false)
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, close])

  const shelf = shelves.find((s) => s.id === menu?.shelfId)
  if (!menu || !shelf) return null

  const ids = files.filter((f) => f.shelfId === shelf.id && f.exists).map((f) => f.id)
  const expiryLabel = (h: number | null) =>
    h === null ? t.expiryOff : h === 24 ? t.expiry24h : h === 24 * 7 ? t.expiry7d : t.expiry30d

  const run = async (fn: () => Promise<void>) => {
    close()
    await fn()
  }

  const onDragZip = (e: DragEvent) => {
    e.preventDefault()
    if (ids.length === 0) return
    document.body.dataset.stashDragging = '1'
    close()
    void window.stash.startDragZip(ids, shelf.name).finally(() => {
      delete document.body.dataset.stashDragging
    })
  }

  const row = 'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--pill)]'
  const x = Math.min(menu.x, window.innerWidth - 240)

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[230px] overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] py-1"
      style={{ left: x, top: menu.y, boxShadow: 'var(--hover-shadow)' }}
    >
      <button
        type="button"
        role="menuitem"
        className={row}
        onClick={() =>
          void run(async () => {
            const next = await askPrompt({
              title: t.renameShelf,
              message: t.renameShelfHint,
              promptDefault: shelf.name,
              promptPlaceholder: t.shelfName,
              confirmLabel: t.save
            })
            if (next && next.trim() && next.trim() !== shelf.name) {
              await window.stash.renameShelf(shelf.id, next.trim())
              await refresh()
            }
          })
        }
      >
        <Pencil className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
        {t.renameShelf}
      </button>
      <button
        type="button"
        role="menuitem"
        className={cn(row, ids.length === 0 && 'opacity-40')}
        disabled={ids.length === 0}
        onClick={() => void run(async () => void (await window.stash.openFiles(ids)))}
      >
        <ExternalLink className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
        {t.openAll}
      </button>
      <div
        role="menuitem"
        draggable={ids.length > 0}
        onDragStart={onDragZip}
        className={cn(row, 'cursor-grab', ids.length === 0 && 'opacity-40')}
      >
        <Archive className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
        {t.dragAsZip}
      </div>
      <button
        type="button"
        role="menuitem"
        aria-expanded={expiryOpen}
        className={row}
        onClick={() => setExpiryOpen((v) => !v)}
      >
        <Clock className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
        <span className="flex-1">{t.tempShelf}</span>
        <ChevronRight
          className={cn('h-3.5 w-3.5 opacity-60 transition-transform', expiryOpen && 'rotate-90')}
          strokeWidth={1.75}
        />
      </button>
      {expiryOpen &&
        EXPIRY_OPTIONS.map((h) => (
          <button
            key={String(h)}
            type="button"
            role="menuitemradio"
            aria-checked={shelf.expireHours === h}
            className={cn(row, 'pl-9', shelf.expireHours === h && 'font-semibold text-[var(--accent)]')}
            onClick={() =>
              void run(async () => {
                await window.stash.setShelfExpiry(shelf.id, h)
                await refresh()
              })
            }
          >
            {expiryLabel(h)}
          </button>
        ))}
      <button
        type="button"
        role="menuitem"
        className={row}
        onClick={() => void run(async () => void (await window.stash.openWidget(shelf.id)))}
      >
        <MonitorUp className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
        {t.pinToDesktop}
      </button>
      <div className="my-1 border-t border-[var(--border)]" />
      <button
        type="button"
        role="menuitem"
        disabled={shelves.length <= 1}
        className={cn(row, 'text-[var(--destructive)] disabled:opacity-40')}
        onClick={() =>
          void run(async () => {
            const ok = await askConfirm({
              title: t.deleteShelf(shelf.name),
              message: t.deleteShelfConfirm(shelf.name),
              confirmLabel: t.delete,
              danger: true
            })
            if (!ok) return
            try {
              await window.stash.deleteShelf(shelf.id)
              await refresh()
            } catch {
              showToast(t.cannotDeleteLast)
            }
          })
        }
      >
        <Trash2 className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
        {t.deleteShelf(shelf.name)}
      </button>
    </div>
  )
}
