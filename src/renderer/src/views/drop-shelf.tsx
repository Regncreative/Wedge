import { useCallback, useEffect, useRef, useState } from 'react'
import { Inbox, Trash2, X } from 'lucide-react'
import type { Shelf, StashFile } from '@shared/types'
import { cn } from '@/lib/utils'
import { MiniFileRow, dragOut, useDropInto, useWindowSetup } from './mini'

/** Hide an empty shelf that nobody dropped anything on. */
const IDLE_HIDE_MS = 8000

/**
 * The floating drop shelf (shake the mouse while dragging): collect files
 * from anywhere, then drag them all out together.
 */
export function DropShelfView() {
  const t = useWindowSetup()
  const [shelf, setShelf] = useState<Shelf | null>(null)
  const [files, setFiles] = useState<StashFile[]>([])
  const idleTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    const s = await window.stash.dropShelf()
    setShelf(s)
    setFiles(await window.stash.listFiles(s.id))
  }, [])

  const armIdleHide = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(async () => {
      const s = await window.stash.dropShelf()
      const current = await window.stash.listFiles(s.id)
      if (current.length === 0) void window.stash.hideDropShelf()
    }, IDLE_HIDE_MS)
  }, [])

  useEffect(() => {
    void load()
    const offShown = window.stash.onDropShelfShown(() => {
      void load()
      armIdleHide()
    })
    const offChanged = window.stash.onFilesChanged(() => void load())
    return () => {
      offShown()
      offChanged()
    }
  }, [load, armIdleHide])

  const over = useDropInto(shelf?.id ?? null, () => void load())
  const ids = files.filter((f) => f.exists).map((f) => f.id)

  if (!t) return null

  return (
    <div
      className={cn(
        'app-shell flex h-full flex-col rounded-[18px] p-3 transition-colors',
        over && 'ring-2 ring-[var(--accent)]'
      )}
      onKeyDown={(e) => e.key === 'Escape' && void window.stash.hideDropShelf()}
    >
      <div className="flex items-center gap-2 pb-2" data-tauri-drag-region>
        <Inbox size={16} className="text-[var(--accent)]" strokeWidth={1.75} />
        <span className="flex-1 truncate text-[13px] font-semibold text-[var(--foreground)]" data-tauri-drag-region>
          {shelf?.name}
        </span>
        <button
          type="button"
          className="icon-btn h-7 w-7"
          aria-label={t.close}
          onClick={() => void window.stash.hideDropShelf()}
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      {files.length === 0 ? (
        <div
          className={cn(
            'flex flex-1 items-center justify-center rounded-[14px] border-2 border-dashed px-4 text-center text-[12.5px] leading-snug',
            over
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]'
              : 'border-[var(--border)] text-[var(--muted-foreground)]'
          )}
        >
          {t.dropShelfHint}
        </div>
      ) : (
        <ul className="scroll-autohide min-h-0 flex-1 space-y-0.5 overflow-y-auto" role="list">
          {files.map((f) => (
            <MiniFileRow key={f.id} file={f} t={t} />
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="flex gap-1.5 pt-2">
          <div
            role="button"
            tabIndex={0}
            draggable={ids.length > 0}
            onDragStart={(e) => dragOut(e, ids)}
            className="flex h-9 flex-1 cursor-grab items-center justify-center rounded-[10px] bg-[var(--accent)] text-[12.5px] font-semibold text-white"
          >
            {t.dragAll} ({ids.length})
          </div>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--pill)] px-3 text-[12.5px] text-[var(--foreground)] hover:bg-[var(--pill-hover)]"
            onClick={async () => {
              await window.stash.removeFiles(files.map((f) => f.id))
              await load()
            }}
            aria-label={t.clearShelf}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  )
}
