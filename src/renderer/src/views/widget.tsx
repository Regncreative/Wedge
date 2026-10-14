import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Shelf, StashFile } from '@shared/types'
import { ShelfIcon } from '@/components/file-icon'
import { cn } from '@/lib/utils'
import { MiniFileRow, useDropInto, useWindowSetup } from './mini'

/** A shelf pinned to the desktop. Drag the header to move it. */
export function WidgetView({ shelfId }: { shelfId: string }) {
  const t = useWindowSetup()
  const [shelf, setShelf] = useState<Shelf | null>(null)
  const [files, setFiles] = useState<StashFile[]>([])

  const load = useCallback(async () => {
    const shelves = await window.stash.listShelves()
    setShelf(shelves.find((s) => s.id === shelfId) ?? null)
    setFiles(await window.stash.listFiles(shelfId))
  }, [shelfId])

  useEffect(() => {
    void load()
    const off = window.stash.onFilesChanged(() => void load())
    // Changes made in the panel don't emit events; catch up regularly.
    const timer = window.setInterval(() => void load(), 5000)
    window.addEventListener('focus', load)
    return () => {
      off()
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [load])

  const over = useDropInto(shelfId, () => void load())

  if (!t) return null

  return (
    <div className={cn('app-shell flex h-full flex-col rounded-[16px] p-2.5', over && 'ring-2 ring-[var(--accent)]')}>
      <div className="flex cursor-move items-center gap-2 px-1 pb-2" data-tauri-drag-region>
        {shelf && <ShelfIcon name={shelf.icon} color={shelf.color} />}
        <span className="flex-1 truncate text-[13px] font-semibold text-[var(--foreground)]" data-tauri-drag-region>
          {shelf?.name ?? '…'}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]" data-tauri-drag-region>
          {files.length}
        </span>
        <button
          type="button"
          className="icon-btn h-6 w-6"
          aria-label={t.unpinFromDesktop}
          title={t.unpinFromDesktop}
          onClick={() => void window.stash.closeWidget(shelfId)}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      {files.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-[12px] text-[var(--muted-foreground)]">
          {t.widgetEmpty}
        </p>
      ) : (
        <ul className="scroll-autohide min-h-0 flex-1 space-y-0.5 overflow-y-auto" role="list">
          {files.map((f) => (
            <MiniFileRow key={f.id} file={f} t={t} />
          ))}
        </ul>
      )}
    </div>
  )
}
