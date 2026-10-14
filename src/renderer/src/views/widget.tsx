import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, X } from 'lucide-react'
import type { Shelf, StashFile } from '@shared/types'
import { FileTypeIcon, ShelfIcon } from '@/components/file-icon'
import { PreviewBody } from '@/components/quick-look'
import { hasThumbnail, useFileVisual } from '@/hooks/use-file-visual'
import { dragOut } from '@/lib/file-drop'
import { formatBytes } from '@/lib/format'
import type { Messages } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useWindowSetup } from './mini'

function Row({
  file,
  t,
  focused,
  tabbable,
  onFocus,
  onHover
}: {
  file: StashFile
  t: Messages
  focused: boolean
  tabbable: boolean
  onFocus: () => void
  onHover: (id: string | null) => void
}) {
  const { icon, thumb } = useFileVisual(file, hasThumbnail(file, false))
  return (
    <li
      role="option"
      aria-selected={focused}
      tabIndex={tabbable ? 0 : -1}
      data-file-id={file.id}
      draggable={file.exists}
      onDragStart={(e) => {
        e.preventDefault()
        if (file.exists) void dragOut(() => window.stash.startDrag([file.id]))
      }}
      onClick={onFocus}
      onFocus={onFocus}
      onDoubleClick={() => file.exists && void window.stash.openFile(file.id)}
      onMouseEnter={() => onHover(file.id)}
      onMouseLeave={() => onHover(null)}
      title={file.absolutePath}
      className={cn(
        'stash-drag-source flex items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 outline-none transition-colors',
        focused ? 'bg-[var(--accent-faint)]' : 'hover:bg-[var(--surface-hover)]',
        !file.exists && 'opacity-50'
      )}
      aria-label={file.exists ? file.name : `${file.name} (${t.fileNotFound})`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          draggable={false}
          className="h-8 w-8 shrink-0 rounded-[7px] object-cover shadow-[0_0_0_1px_var(--stroke)]"
        />
      ) : icon && !file.isDirectory ? (
        <img
          src={icon}
          alt=""
          draggable={false}
          className="h-8 w-8 shrink-0 object-contain p-0.5"
        />
      ) : (
        <FileTypeIcon file={file} size={32} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-[var(--fg)]">{file.name}</div>
        <div className="truncate text-[10.5px] text-[var(--fg-3)]">
          {file.isDirectory ? t.folder : formatBytes(file.size)}
        </div>
      </div>
    </li>
  )
}

/** A shelf pinned to the desktop. Drag the header to move it; hover or Space to preview. */
export function WidgetView({ shelfId }: { shelfId: string }) {
  const t = useWindowSetup()
  const [shelf, setShelf] = useState<Shelf | null>(null)
  const [files, setFiles] = useState<StashFile[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [peekId, setPeekId] = useState<string | null>(null)
  const [lookId, setLookId] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const hoverTimer = useRef<number | null>(null)

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

  useEffect(
    () =>
      window.stash.onFileDrop((event) => {
        if (event.type === 'enter') setOver(true)
        else if (event.type === 'leave') setOver(false)
        else if (event.type === 'drop') {
          setOver(false)
          void window.stash.addFiles(event.paths, shelfId).then(() => load())
        }
      }),
    [shelfId, load]
  )

  // Hovering a row for a moment peeks at it.
  useEffect(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    if (!hoverId) {
      setPeekId(null)
      return
    }
    hoverTimer.current = window.setTimeout(() => setPeekId(hoverId), 450)
    return () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    }
  }, [hoverId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const index = files.findIndex((f) => f.id === focusedId)
      if (e.key === ' ') {
        e.preventDefault()
        const id = lookId ? null : (focusedId ?? hoverId)
        setLookId(id)
      } else if (e.key === 'Escape') {
        setLookId(null)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next =
          files[Math.max(0, Math.min(files.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (next) {
          setFocusedId(next.id)
          if (lookId) setLookId(next.id)
          document.querySelector<HTMLElement>(`[data-file-id="${CSS.escape(next.id)}"]`)?.focus()
        }
      } else if (e.key === 'Enter' && focusedId) {
        void window.stash.openFile(focusedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [files, focusedId, hoverId, lookId])

  if (!t) return null
  const peek = files.find((f) => f.id === peekId)
  const look = files.find((f) => f.id === lookId)

  return (
    <div
      className={cn(
        'app-shell flex-col rounded-[14px] p-2',
        over && 'shadow-[inset_0_0_0_2px_var(--accent)]'
      )}
    >
      <div className="flex cursor-move items-center gap-2 px-1 pb-2 pt-0.5" data-tauri-drag-region>
        {shelf && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-[7px]"
            style={{ background: `color-mix(in srgb, ${shelf.color} 20%, transparent)` }}
            data-tauri-drag-region
          >
            <ShelfIcon name={shelf.icon} color={shelf.color} size={14} />
          </span>
        )}
        <span
          className="display-font flex-1 truncate text-[13px] font-semibold text-[var(--fg)]"
          data-tauri-drag-region
        >
          {shelf?.name ?? '…'}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--fg-3)]" data-tauri-drag-region>
          {files.length}
        </span>
        <button
          type="button"
          className="btn-icon h-6 w-6"
          aria-label={t.unpinFromDesktop}
          title={t.unpinFromDesktop}
          onClick={() => void window.stash.closeWidget(shelfId)}
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>

      {files.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-[12px] text-[var(--fg-3)]">
          {t.widgetEmpty}
        </p>
      ) : (
        <ul
          className="scroll-autohide min-h-0 flex-1 space-y-0.5 overflow-y-auto"
          role="listbox"
          aria-label={shelf?.name}
        >
          {files.map((f, i) => (
            <Row
              key={f.id}
              file={f}
              t={t}
              focused={focusedId === f.id}
              onFocus={() => setFocusedId(f.id)}
              onHover={setHoverId}
              // The first row is tabbable until something is focused.
              tabbable={focusedId === null ? i === 0 : focusedId === f.id}
            />
          ))}
        </ul>
      )}

      {/* Hover peek: a large thumbnail at the bottom of the widget. */}
      <AnimatePresence>
        {peek && !look && hasThumbnail(peek, true) && (
          <motion.div
            key={peek.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flyout pointer-events-none absolute inset-x-2 bottom-2 flex h-[45%] items-center justify-center overflow-hidden p-1.5"
          >
            <PreviewBody file={peek} t={t} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Space: the full preview inside the widget. */}
      {look && (
        <div
          className="absolute inset-0 z-10 flex flex-col rounded-[14px] bg-[var(--bg-solid)] p-2"
          role="dialog"
          aria-label={`${t.preview}: ${look.name}`}
        >
          <div className="flex items-center gap-1 px-1 pb-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--fg)]">
              {look.name}
            </span>
            <button
              type="button"
              className="btn-icon h-6 w-6"
              aria-label={t.open}
              onClick={() => void window.stash.openFile(look.id)}
            >
              <ExternalLink size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="btn-icon h-6 w-6"
              aria-label={t.close}
              onClick={() => setLookId(null)}
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-[var(--surface)]">
            <PreviewBody file={look} t={t} />
          </div>
        </div>
      )}
    </div>
  )
}
