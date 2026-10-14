import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  Bell,
  ChevronRight,
  Copy,
  Eye,
  ExternalLink,
  FolderInput,
  FolderOpen,
  FolderSymlink,
  ImageIcon,
  Info,
  NotebookPen,
  Pin,
  PinOff,
  Trash2
} from 'lucide-react'
import { useStashStore } from '@/stores/stash-store'
import { useSelectionActions } from '@/hooks/use-selection-actions'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { IMAGE_EXTS } from '@shared/types'
import type { ImageFormat } from '@/lib/api'

interface Item {
  label: string
  icon: typeof ExternalLink
  danger?: boolean
  action?: () => Promise<void> | void
  children?: Item[]
}

function tomorrowAt9(): number {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function ContextMenu() {
  const t = useT()
  const contextMenu = useStashStore((s) => s.contextMenu)
  const closeContextMenu = useStashStore((s) => s.closeContextMenu)
  const shelves = useStashStore((s) => s.shelves)
  const files = useStashStore((s) => s.files)
  const selectedIds = useStashStore((s) => s.selectedIds)
  const refresh = useStashStore((s) => s.refresh)
  const showToast = useStashStore((s) => s.showToast)
  const openQuickLook = useStashStore((s) => s.openQuickLook)
  const editNote = useStashStore((s) => s.editNote)
  const { removeSelected } = useSelectionActions()
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<string | null>(null)

  const file = files.find((f) => f.id === contextMenu?.fileId)

  useEffect(() => {
    setOpen(null)
    if (!contextMenu) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeContextMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu, closeContextMenu])

  if (!contextMenu || !file) return null

  // Acting on a file that is part of a multi-selection acts on all of it.
  const ids = selectedIds.length > 1 && selectedIds.includes(file.id) ? selectedIds : [file.id]
  const many = ids.length > 1
  const targets = files.filter((f) => ids.includes(f.id))
  const images = targets.filter((f) => IMAGE_EXTS.has(f.extension))

  const run = async (fn: () => Promise<void> | void) => {
    closeContextMenu()
    await fn()
  }

  const remindAt = async (at: number | null) => {
    for (const id of ids) await window.stash.setReminder(id, at)
    await refresh()
    showToast(at ? t.reminderSet(formatWhen(at)) : t.reminderCleared)
  }

  const convert = async (format: ImageFormat, maxSide?: number) => {
    const res = await window.stash.convertImages(
      images.map((f) => f.id),
      format,
      maxSide
    )
    await refresh()
    showToast(res.converted > 0 ? t.converted(res.converted) : t.convertFailed)
  }

  const items: Item[] = [
    ...(!many
      ? [
          {
            label: t.open,
            icon: ExternalLink,
            action: async () => {
              const res = await window.stash.openFile(file.id)
              if (!res.ok) showToast(res.error === 'missing' ? t.fileNotFound : t.couldNotOpen)
            }
          },
          { label: t.preview, icon: Eye, action: () => openQuickLook(file.id) },
          {
            label: t.reveal,
            icon: FolderOpen,
            action: async () => {
              const res = await window.stash.revealFile(file.id)
              if (!res.ok) showToast(t.fileNotFound)
            }
          }
        ]
      : [
          {
            label: t.openAll,
            icon: ExternalLink,
            action: async () => {
              await window.stash.openFiles(ids)
            }
          }
        ]),
    {
      label: t.copyPath,
      icon: Copy,
      action: async () => {
        const n = await window.stash.copyPaths(ids)
        showToast(many ? t.pathsCopied(n) : t.pathCopied)
      }
    },
    {
      label: file.isPinned ? t.unpin : t.pin,
      icon: file.isPinned ? PinOff : Pin,
      action: async () => {
        await window.stash.pinFiles(ids, !file.isPinned)
        await refresh()
      }
    },
    ...(!many ? [{ label: t.noteAndTags, icon: NotebookPen, action: () => editNote(file.id) }] : []),
    {
      label: t.remind,
      icon: Bell,
      children: [
        { label: t.remindIn1h, icon: Bell, action: () => remindAt(Date.now() + 3_600_000) },
        { label: t.remindTomorrow, icon: Bell, action: () => remindAt(tomorrowAt9()) },
        { label: t.remindNextWeek, icon: Bell, action: () => remindAt(Date.now() + 7 * 86_400_000) },
        ...(file.remindAt ? [{ label: t.remindClear, icon: Bell, action: () => remindAt(null) }] : [])
      ]
    },
    ...(images.length > 0
      ? [
          {
            label: t.convert,
            icon: ImageIcon,
            children: [
              { label: t.toFormat('JPG'), icon: ImageIcon, action: () => convert('jpg') },
              { label: t.toFormat('PNG'), icon: ImageIcon, action: () => convert('png') },
              { label: t.toFormat('WebP'), icon: ImageIcon, action: () => convert('webp') },
              { label: t.shrinkTo(1920), icon: ImageIcon, action: () => convert('jpg', 1920) },
              { label: t.shrinkTo(1280), icon: ImageIcon, action: () => convert('jpg', 1280) }
            ]
          }
        ]
      : []),
    {
      label: t.makeZip,
      icon: Archive,
      action: async () => {
        const res = await window.stash.zipFiles(ids)
        await refresh()
        showToast(res.ok ? t.zipDone : t.fileNotFound)
      }
    },
    {
      label: t.copyToFolder,
      icon: FolderSymlink,
      action: async () => {
        const res = await window.stash.collectFiles(ids)
        if (res.ok) showToast(t.copiedTo(res.copied ?? 0))
      }
    },
    ...(!many
      ? [
          {
            label: t.properties,
            icon: Info,
            action: async () => {
              const res = await window.stash.getProperties(file.id)
              if (!res.ok) showToast(t.missingOnDisk)
            }
          }
        ]
      : []),
    ...(shelves.length > 1
      ? [
          {
            label: t.moveToShelf,
            icon: FolderInput,
            children: shelves
              .filter((s) => s.id !== file.shelfId)
              .map((shelf) => ({
                label: shelf.name,
                icon: FolderInput,
                action: async () => {
                  for (const id of ids) await window.stash.moveFile(id, shelf.id)
                  await refresh()
                  showToast(t.movedTo(shelf.name))
                }
              }))
          }
        ]
      : []),
    {
      label: t.removeFromShelf,
      icon: Trash2,
      danger: true,
      action: async () => {
        // Same confirmation and toast as the selection bar.
        if (!many) useStashStore.setState({ selectedIds: [file.id] })
        await removeSelected()
      }
    }
  ]

  const rowClass = (danger?: boolean) =>
    cn(
      'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--pill)]',
      danger && 'text-[var(--destructive)]'
    )

  const menuW = 230
  const x = Math.min(contextMenu.x, window.innerWidth - menuW - 8)
  const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 460))

  return (
    <div
      ref={ref}
      className="scroll-autohide fixed z-50 max-h-[calc(100%-16px)] min-w-[230px] overflow-y-auto rounded-[12px] border border-[var(--border)] bg-[var(--card)]"
      style={{ left: x, top: y, boxShadow: 'var(--hover-shadow)' }}
      role="menu"
    >
      <div className="py-1">
        {many && (
          <div className="px-3 py-1 text-[11px] font-semibold text-[var(--muted-foreground)]">
            {t.selectedCount(ids.length)}
          </div>
        )}
        {items.map((item) =>
          item.children ? (
            <div key={item.label}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open === item.label}
                onClick={() => setOpen(open === item.label ? null : item.label)}
                className={rowClass()}
              >
                <item.icon className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
                <ChevronRight
                  className={cn('h-3.5 w-3.5 opacity-60 transition-transform', open === item.label && 'rotate-90')}
                  strokeWidth={1.75}
                />
              </button>
              {open === item.label && (
                <div role="menu" className="bg-[var(--pill)]/40">
                  {item.children.map((child) => (
                    <button
                      key={child.label}
                      type="button"
                      role="menuitem"
                      onClick={() => child.action && void run(child.action)}
                      className={cn(rowClass(child.danger), 'pl-9')}
                    >
                      <span className="truncate">{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => item.action && void run(item.action)}
              className={rowClass(item.danger)}
            >
              <item.icon className="h-3.5 w-3.5 opacity-70" strokeWidth={1.75} />
              {item.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
