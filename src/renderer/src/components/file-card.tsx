import type { CSSProperties, DragEvent, MouseEvent } from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Pin, Trash2 } from 'lucide-react'
import type { StashFile } from '@shared/types'
import { FileTypeIcon } from './file-icon'
import { formatBytes, formatClock } from '@/lib/format'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { IMAGE_EXTS } from '@shared/types'
import { useT } from '@/lib/i18n'

/** Process-wide cache so icons persist across virtualized mount/unmount. */
const iconMemo = new Map<string, string | null>()
const previewMemo = new Map<string, string | null>()

interface FileCardProps {
  file: StashFile
  style?: CSSProperties
  index?: number
  /** Hide hover image preview while the list is scrolling (avoids scroll jank). */
  allowPreview?: boolean
}

export const FileCard = memo(function FileCard({
  file,
  style,
  index = 0,
  allowPreview = true
}: FileCardProps) {
  const t = useT()
  const openContextMenu = useStashStore((s) => s.openContextMenu)
  const refresh = useStashStore((s) => s.refresh)
  const showToast = useStashStore((s) => s.showToast)
  const askConfirm = useStashStore((s) => s.askConfirm)
  const selectFile = useStashStore((s) => s.selectFile)
  const setFocused = useStashStore((s) => s.setFocused)
  const selected = useStashStore((s) => s.selectedIds.includes(file.id))
  // Roving tabindex: the focused row, or the first row before anything is focused.
  const tabbable = useStashStore((s) =>
    s.focusedId === null ? index === 0 : s.focusedId === file.id
  )
  const [preview, setPreview] = useState(false)
  const [previewPos, setPreviewPos] = useState<{ left: number; top: number } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    () => previewMemo.get(file.id) ?? null
  )
  const cardRef = useRef<HTMLDivElement>(null)
  const [icon, setIcon] = useState<string | null>(() => iconMemo.get(file.id) ?? null)

  useEffect(() => {
    if (!file.exists || file.isDirectory) return
    if (iconMemo.has(file.id)) {
      setIcon(iconMemo.get(file.id) ?? null)
      return
    }
    let alive = true
    void window.stash.getFileIcon(file.id).then((url) => {
      iconMemo.set(file.id, url)
      if (alive) setIcon(url)
    })
    return () => {
      alive = false
    }
  }, [file.id, file.exists, file.isDirectory])

  useEffect(() => {
    if (!allowPreview) {
      setPreview(false)
      setPreviewPos(null)
    }
  }, [allowPreview])

  const onDragStart = useCallback(
    (e: DragEvent) => {
      if (!file.exists) {
        e.preventDefault()
        return
      }
      // The native drag (started in Rust) replaces the browser's own.
      e.preventDefault()
      // Mark outbound so DropZone doesn't treat this as an inbound drop
      document.body.dataset.stashDragging = '1'
      // Dragging a selected row drags the whole selection.
      const { selectedIds, files } = useStashStore.getState()
      const ids =
        selectedIds.length > 1 && selectedIds.includes(file.id)
          ? selectedIds.filter((id) => files.find((f) => f.id === id)?.exists)
          : [file.id]
      // Resolves when the native drag ends (dropped or cancelled).
      void window.stash.startDrag(ids).finally(() => {
        delete document.body.dataset.stashDragging
      })
    },
    [file]
  )

  const togglePin = async (e: MouseEvent) => {
    e.stopPropagation()
    await window.stash.pinFile(file.id, !file.isPinned)
    await refresh()
  }

  const removeFile = async (e: MouseEvent) => {
    e.stopPropagation()
    const ok = await askConfirm({
      title: t.removeFromShelf,
      message: t.removeFileConfirm(file.name),
      confirmLabel: t.remove,
      danger: true
    })
    if (!ok) return
    await window.stash.removeFile(file.id)
    await refresh()
    showToast(t.removedKept)
  }

  const showImagePreview =
    allowPreview &&
    preview &&
    previewPos &&
    file.exists &&
    !file.isDirectory &&
    IMAGE_EXTS.has(file.extension)

  useEffect(() => {
    if (!showImagePreview || previewMemo.has(file.id)) return
    let alive = true
    void window.stash.getPreview(file.id).then((url) => {
      previewMemo.set(file.id, url)
      if (alive) setPreviewUrl(url)
    })
    return () => {
      alive = false
    }
  }, [showImagePreview, file.id])

  const openPreview = () => {
    if (!allowPreview) return
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) {
      setPreview(true)
      return
    }
    // Prefer below the row; flip above if near the bottom of the panel.
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow < 160 ? Math.max(8, rect.top - 148) : rect.bottom - 4
    setPreviewPos({ left: Math.min(rect.left + 56, window.innerWidth - 220), top })
    setPreview(true)
  }

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, delay: Math.min(index, 6) * 0.015 }}
      style={style}
      className="mx-5 h-[72px]"
    >
      <div
        ref={cardRef}
        className={cn(
          'stash-drag-source group relative flex h-full items-center gap-3.5 rounded-[14px] px-3.5',
          'bg-[var(--card)] outline-none',
          'transition-colors duration-150 ease-out',
          'focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
          selected && 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]',
          file.exists
            ? 'cursor-grab active:cursor-grabbing hover:bg-[var(--card-hover)] hover:shadow-[var(--hover-shadow)]'
            : 'cursor-not-allowed opacity-60'
        )}
        draggable={file.exists}
        onDragStart={onDragStart}
        onClick={(e) => {
          selectFile(file.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single')
        }}
        onFocus={() => setFocused(file.id)}
        onDoubleClick={() => {
          if (!file.exists) return
          void window.stash.openFile(file.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          openContextMenu(e.clientX, e.clientY, file.id)
        }}
        onMouseEnter={openPreview}
        onMouseLeave={() => {
          setPreview(false)
          setPreviewPos(null)
        }}
        role="option"
        aria-selected={selected}
        tabIndex={tabbable ? 0 : -1}
        data-file-id={file.id}
        aria-label={file.exists ? file.name : `${file.name} (${t.fileNotFound})`}
      >
        <div className={cn('relative shrink-0', !file.exists && 'grayscale')}>
          {icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-black/5 dark:bg-white/5">
              <img src={icon} alt="" className="h-7 w-7 object-contain" draggable={false} />
            </div>
          ) : (
            <FileTypeIcon file={file} />
          )}
          {!file.exists && (
            <AlertTriangle className="absolute -right-1 -top-1 h-3.5 w-3.5 text-amber-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate-path text-[15px] font-medium leading-tight text-[var(--foreground)]',
              !file.exists &&
                'text-[var(--muted-foreground)] line-through decoration-[var(--muted-foreground)]/70'
            )}
          >
            {file.name}
          </div>
          <div className="mt-1.5 text-[13px] leading-none text-[var(--muted-foreground)]">
            {!file.exists ? (
              <span className="text-amber-500">{t.fileNotFound}</span>
            ) : file.isDirectory ? (
              t.folder
            ) : (
              formatBytes(file.size)
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="mr-1.5 text-[13px] tabular-nums leading-none text-[var(--muted-foreground)]">
            {formatClock(file.addedAt)}
          </span>
          <button
            type="button"
            onClick={togglePin}
            tabIndex={-1}
            className={cn(
              'rounded-md p-1.5 transition-colors duration-150',
              file.isPinned
                ? 'text-[var(--accent)]'
                : 'text-[var(--muted-foreground)] opacity-40 group-hover:opacity-100'
            )}
            aria-label={file.isPinned ? t.unpin : t.pin}
          >
            <Pin size={16} strokeWidth={1.75} fill={file.isPinned ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={removeFile}
            tabIndex={-1}
            className="rounded-md p-1.5 text-[var(--muted-foreground)] opacity-40 transition-colors duration-150 hover:text-[var(--destructive)] group-hover:opacity-100"
            aria-label={t.removeFromShelf}
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {showImagePreview &&
        previewPos &&
        previewUrl &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[90] overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--preview-bg)] shadow-[var(--hover-shadow)]"
            style={{ left: previewPos.left, top: previewPos.top }}
          >
            <img
              src={previewUrl}
              alt=""
              className="max-h-36 max-w-[200px] object-contain"
              draggable={false}
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>,
          document.body
        )}
    </motion.div>
  )
})
