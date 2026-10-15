import type { DragEvent, MouseEvent } from 'react'
import { memo } from 'react'
import { Bell, MoreHorizontal } from 'lucide-react'
import type { StashFile } from '@shared/types'
import { FileThumb } from './file-thumb'
import { hasThumbnail, useFileVisual } from '@/hooks/use-file-visual'
import { dragFilesOut, openFile } from '@/lib/file-actions'
import { formatBytes, formatStamp } from '@/lib/format'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface CardProps {
  file: StashFile
  index: number
  /** Shelf name, when results span shelves (search). */
  shelfName?: string
}

/** A file in the drawer: a card with its picture, name and a catalog line. */
export const FileCard = memo(function FileCard({ file, index, shelfName }: CardProps) {
  const t = useT()
  const selected = useStashStore((s) => s.selectedIds.includes(file.id))
  // Roving tabindex: the focused card, or the first one before anything is focused.
  const tabbable = useStashStore((s) =>
    s.focusedId === null ? index === 0 : s.focusedId === file.id
  )
  const lang = useStashStore((s) => s.settings?.language ?? 'en')
  const { icon, thumb } = useFileVisual(file, hasThumbnail(file, true))

  const onDragStart = (e: DragEvent) => {
    // The native drag (started in Rust) replaces the browser's own.
    e.preventDefault()
    if (!file.exists) return
    // Dragging a selected card drags the whole selection.
    const { selectedIds, files } = useStashStore.getState()
    const ids =
      selectedIds.length > 1 && selectedIds.includes(file.id)
        ? selectedIds.filter((id) => files.find((f) => f.id === id)?.exists)
        : [file.id]
    void dragFilesOut(ids)
  }

  const openMenu = (e: MouseEvent) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    useStashStore.getState().openContextMenu(r.right - 236, r.bottom + 4, file.id)
  }

  const kind = file.isDirectory
    ? t.folder.toLocaleUpperCase(lang)
    : (file.extension || '—').toUpperCase().slice(0, 5)

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      data-file-id={file.id}
      aria-label={file.exists ? file.name : `${file.name} (${t.fileNotFound})`}
      draggable={file.exists}
      onDragStart={onDragStart}
      onClick={(e) =>
        useStashStore
          .getState()
          .selectFile(file.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single')
      }
      onFocus={() => useStashStore.getState().setFocused(file.id)}
      onDoubleClick={() => file.exists && void openFile(file.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        useStashStore.getState().openContextMenu(e.clientX, e.clientY, file.id)
      }}
      title={file.note ? `${file.name}\n${file.note}` : file.absolutePath}
      className={cn(
        'stash-drag-source group relative flex h-full flex-col gap-2 rounded-2xl p-2 pb-2.5 outline-none',
        'transition-[transform,background-color,box-shadow] duration-150 [transition-timing-function:var(--spring)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        selected
          ? 'bg-[var(--accent-faint)] shadow-[inset_0_0_0_1.5px_var(--accent)]'
          : 'bg-[var(--surface)] shadow-[var(--shadow-card)] hover:-translate-y-[3px] hover:bg-[var(--surface-hover)]',
        !file.exists && 'opacity-55'
      )}
    >
      <div
        className={cn(
          'relative h-[124px] shrink-0 overflow-hidden rounded-[11px]',
          !file.exists && 'grayscale'
        )}
      >
        <FileThumb file={file} thumb={thumb} icon={icon} />
        {(file.isPinned || file.remindAt) && (
          <div className="absolute bottom-1.5 left-1.5 flex gap-1">
            {file.isPinned && (
              <span className="mono rounded-[7px] bg-[var(--accent)] px-1.5 py-[3px] text-[9px] font-medium tracking-wide text-[var(--on-accent)]">
                {t.pinned.toLocaleUpperCase(lang)}
              </span>
            )}
            {file.remindAt && (
              <span
                className="flex h-[19px] w-[19px] items-center justify-center rounded-[7px] bg-[var(--accent)] text-[var(--on-accent)]"
                aria-label={new Date(file.remindAt).toLocaleString(lang)}
              >
                <Bell size={11} strokeWidth={2.25} />
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          tabIndex={-1}
          className="btn-icon absolute right-1.5 top-1.5 h-7 w-7 bg-[var(--bg-solid)] opacity-0 shadow-[var(--shadow-card)] group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label={t.more}
          onClick={openMenu}
        >
          <MoreHorizontal size={15} strokeWidth={1.75} />
        </button>
      </div>
      <div className="min-w-0 px-1">
        <div
          className={cn(
            'truncate-2 text-[12.5px] font-medium leading-snug text-[var(--fg)]',
            !file.exists && 'line-through'
          )}
        >
          {file.name}
        </div>
        {file.note && (
          <div className="mt-0.5 truncate text-[11.5px] text-[var(--fg-2)]">{file.note}</div>
        )}
        <div className="mono mt-1 truncate text-[9px] tracking-[0.05em] text-[var(--fg-3)]">
          {!file.exists
            ? t.fileNotFound.toLocaleUpperCase(lang)
            : `${kind} · ${file.isDirectory ? '' : formatBytes(file.size).toUpperCase() + ' · '}${
                shelfName ? shelfName.toLocaleUpperCase(lang) : formatStamp(file.addedAt, lang)
              }`}
        </div>
        {file.tags && (
          <div className="mt-1.5 flex gap-1 overflow-hidden">
            {file.tags.split(',').map((tag) => (
              <span
                key={tag}
                className="shrink-0 rounded-[6px] bg-[var(--accent-faint)] px-1.5 py-px text-[10.5px] font-medium text-[var(--accent-text)]"
              >
                {tag.trim()}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
