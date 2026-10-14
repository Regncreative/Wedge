import type { DragEvent, MouseEvent } from 'react'
import { memo } from 'react'
import { AlertTriangle, Bell, MoreHorizontal, Pin } from 'lucide-react'
import type { StashFile } from '@shared/types'
import { FileTypeIcon } from './file-icon'
import { hasThumbnail, useFileVisual } from '@/hooks/use-file-visual'
import { dragFilesOut, openFile } from '@/lib/file-actions'
import { formatBytes, formatWhen } from '@/lib/format'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface ItemProps {
  file: StashFile
  index: number
  /** Shelf name shown when results span shelves (search, All). */
  shelfName?: string
}

/** Selection, focus, drag and menu behaviour shared by rows and tiles. */
function useItem(file: StashFile, index: number, missingLabel: string) {
  const selected = useStashStore((s) => s.selectedIds.includes(file.id))
  // Roving tabindex: the focused item, or the first one before anything is focused.
  const tabbable = useStashStore((s) =>
    s.focusedId === null ? index === 0 : s.focusedId === file.id
  )
  const lang = useStashStore((s) => s.settings?.language ?? 'en')

  const handlers = {
    draggable: file.exists,
    onDragStart: (e: DragEvent) => {
      // The native drag (started in Rust) replaces the browser's own.
      e.preventDefault()
      if (!file.exists) return
      // Dragging a selected item drags the whole selection.
      const { selectedIds, files } = useStashStore.getState()
      const ids =
        selectedIds.length > 1 && selectedIds.includes(file.id)
          ? selectedIds.filter((id) => files.find((f) => f.id === id)?.exists)
          : [file.id]
      void dragFilesOut(ids)
    },
    onClick: (e: MouseEvent) => {
      useStashStore
        .getState()
        .selectFile(file.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single')
    },
    onFocus: () => useStashStore.getState().setFocused(file.id),
    onDoubleClick: () => {
      if (file.exists) void openFile(file.id)
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault()
      useStashStore.getState().openContextMenu(e.clientX, e.clientY, file.id)
    },
    role: 'option' as const,
    'aria-selected': selected,
    tabIndex: tabbable ? 0 : -1,
    'data-file-id': file.id,
    'aria-label': file.exists ? file.name : `${file.name} (${missingLabel})`
  }
  return { selected, handlers, lang }
}

function openMenu(e: MouseEvent, fileId: string) {
  e.stopPropagation()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  useStashStore.getState().openContextMenu(r.right - 236, r.bottom + 4, fileId)
}

function Tags({ tags }: { tags: string }) {
  if (!tags) return null
  return (
    <>
      {tags.split(',').map((tag) => (
        <span
          key={tag}
          className="shrink-0 rounded-[5px] bg-[var(--accent-faint)] px-1.5 py-px text-[10.5px] font-medium text-[var(--accent-text)]"
        >
          {tag.trim()}
        </span>
      ))}
    </>
  )
}

/** List view: one row per file. */
export const FileRow = memo(function FileRow({ file, index, shelfName }: ItemProps) {
  const t = useT()
  const { selected, handlers, lang } = useItem(file, index, t.fileNotFound)
  const { icon, thumb } = useFileVisual(file, hasThumbnail(file, false))

  return (
    <div
      {...handlers}
      className={cn(
        'stash-drag-source group relative mx-2 flex h-[56px] items-center gap-3 rounded-[10px] px-2.5 outline-none transition-colors duration-100',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]',
        selected ? 'bg-[var(--accent-faint)]' : 'hover:bg-[var(--surface-hover)]',
        file.exists ? 'cursor-default' : 'opacity-60'
      )}
    >
      {selected && (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent)]" />
      )}
      <div className={cn('relative shrink-0', !file.exists && 'grayscale')}>
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="h-10 w-10 rounded-[8px] bg-[var(--thumb-bg)] object-cover shadow-[0_0_0_1px_var(--stroke)]"
          />
        ) : icon && !file.isDirectory ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--thumb-bg)]">
            <img src={icon} alt="" draggable={false} className="h-7 w-7 object-contain" />
          </div>
        ) : (
          <FileTypeIcon file={file} size={40} />
        )}
        {!file.exists && (
          <AlertTriangle className="absolute -right-1 -top-1 h-3.5 w-3.5 text-[var(--warning)]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-[13px] font-medium leading-tight text-[var(--fg)]',
            !file.exists && 'text-[var(--fg-3)] line-through'
          )}
        >
          {file.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-[11.5px] leading-none text-[var(--fg-3)]">
          {!file.exists ? (
            <span className="text-[var(--warning)]">{t.fileNotFound}</span>
          ) : (
            <span className="shrink-0">{file.isDirectory ? t.folder : formatBytes(file.size)}</span>
          )}
          <span className="shrink-0">·</span>
          <span className="shrink-0 tabular-nums">{formatWhen(file.addedAt, lang)}</span>
          {shelfName && (
            <span className="shrink-0 rounded-[5px] bg-[var(--surface-hover)] px-1.5 py-px text-[10.5px] text-[var(--fg-2)]">
              {shelfName}
            </span>
          )}
          <Tags tags={file.tags} />
          {file.note && (
            <span className="min-w-0 truncate text-[var(--fg-2)]" title={file.note}>
              {file.note}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {file.remindAt && (
          <Bell
            size={14}
            strokeWidth={2}
            className="mr-1 text-[var(--accent-text)]"
            aria-label={new Date(file.remindAt).toLocaleString(lang)}
          />
        )}
        {file.isPinned && (
          <Pin
            size={14}
            strokeWidth={2}
            fill="currentColor"
            className="mr-1 text-[var(--accent-text)]"
            aria-label={t.unpin}
          />
        )}
        <button
          type="button"
          tabIndex={-1}
          className="btn-icon h-7 w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-label={t.more}
          onClick={(e) => openMenu(e, file.id)}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
})

/** Grid view: a card with a large preview. */
export const FileTile = memo(function FileTile({ file, index, shelfName }: ItemProps) {
  const t = useT()
  const { selected, handlers } = useItem(file, index, t.fileNotFound)
  const { icon, thumb } = useFileVisual(file, hasThumbnail(file, true))

  return (
    <div
      {...handlers}
      className={cn(
        'stash-drag-source group relative flex h-full flex-col rounded-[12px] p-1.5 outline-none transition-colors duration-100',
        'focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        selected
          ? 'bg-[var(--accent-faint)] ring-1 ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]'
          : 'hover:bg-[var(--surface-hover)]',
        !file.exists && 'opacity-60'
      )}
      title={file.note ? `${file.name}\n${file.note}` : file.name}
    >
      <div
        className={cn(
          'relative flex h-[92px] items-center justify-center overflow-hidden rounded-[9px] bg-[var(--thumb-bg)] shadow-[0_0_0_1px_var(--stroke)]',
          !file.exists && 'grayscale'
        )}
      >
        {thumb ? (
          <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : icon && !file.isDirectory ? (
          <img src={icon} alt="" draggable={false} className="h-12 w-12 object-contain" />
        ) : (
          <FileTypeIcon file={file} size={52} />
        )}
        {file.isPinned && (
          <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-solid)] text-[var(--accent-text)] shadow-[var(--shadow-card)]">
            <Pin size={11} strokeWidth={2.25} fill="currentColor" />
          </span>
        )}
        {file.remindAt && (
          <span className="absolute left-1.5 top-1.5 ml-6 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-solid)] text-[var(--accent-text)] shadow-[var(--shadow-card)]">
            <Bell size={11} strokeWidth={2.25} />
          </span>
        )}
        <button
          type="button"
          tabIndex={-1}
          className="btn-icon absolute right-1 top-1 h-6 w-6 bg-[var(--bg-solid)] opacity-0 shadow-[var(--shadow-card)] group-hover:opacity-100"
          aria-label={t.more}
          onClick={(e) => openMenu(e, file.id)}
        >
          <MoreHorizontal size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="mt-1.5 min-w-0 px-0.5">
        <div className="truncate text-[12px] font-medium leading-tight text-[var(--fg)]">
          {file.name}
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-[var(--fg-3)]">
          {!file.exists
            ? t.fileNotFound
            : (shelfName ?? (file.isDirectory ? t.folder : formatBytes(file.size)))}
        </div>
      </div>
    </div>
  )
})
