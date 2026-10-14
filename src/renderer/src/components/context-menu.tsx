import {
  Archive,
  Bell,
  Copy,
  ExternalLink,
  Eye,
  FolderInput,
  FolderOpen,
  FolderSymlink,
  ImageDown,
  ImageIcon,
  Info,
  NotebookPen,
  Pin,
  PinOff,
  Trash2
} from 'lucide-react'
import { IMAGE_EXTS } from '@shared/types'
import { Menu, type MenuEntry } from './menu'
import {
  convertImages,
  moveFiles,
  openFile,
  removeFiles,
  shrinkImages,
  zipFiles
} from '@/lib/file-actions'
import { formatReminder } from '@/lib/format'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

function tomorrowAt9(): number {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

/** Right-click menu for a file (or the whole selection when it is part of one). */
export function ContextMenu() {
  const t = useT()
  const contextMenu = useStashStore((s) => s.contextMenu)
  const closeContextMenu = useStashStore((s) => s.closeContextMenu)
  const shelves = useStashStore((s) => s.shelves)
  const files = useStashStore((s) => s.files)
  const selectedIds = useStashStore((s) => s.selectedIds)
  const lang = useStashStore((s) => s.settings?.language ?? 'en')

  const file = files.find((f) => f.id === contextMenu?.fileId)
  if (!contextMenu || !file) return null

  const { refresh, showToast, openQuickLook, editNote } = useStashStore.getState()
  const ids = selectedIds.length > 1 && selectedIds.includes(file.id) ? selectedIds : [file.id]
  const many = ids.length > 1
  const targets = files.filter((f) => ids.includes(f.id))
  const images = targets.filter((f) => f.exists && IMAGE_EXTS.has(f.extension.toLowerCase()))
  const imageIds = images.map((f) => f.id)
  const fromShared = targets.some((f) => shelves.find((s) => s.id === f.shelfId)?.folder)

  const remindAt = async (at: number | null) => {
    for (const id of ids) await window.stash.setReminder(id, at)
    await refresh()
    showToast(at ? t.reminderSet(formatReminder(at, lang)) : t.reminderCleared)
  }

  const items: MenuEntry[] = [
    ...(many
      ? [{ label: t.openAll, icon: ExternalLink, action: () => window.stash.openFiles(ids) }]
      : [
          { label: t.open, icon: ExternalLink, action: () => openFile(file.id) },
          { label: t.preview, icon: Eye, action: () => openQuickLook(file.id) },
          {
            label: t.reveal,
            icon: FolderOpen,
            action: async () => {
              const res = await window.stash.revealFile(file.id)
              if (!res.ok) showToast(t.fileNotFound)
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
      separated: true,
      action: async () => {
        await window.stash.pinFiles(ids, !file.isPinned)
        await refresh()
      }
    },
    ...(!many
      ? [{ label: t.noteAndTags, icon: NotebookPen, action: () => editNote(file.id) }]
      : []),
    {
      label: t.remind,
      icon: Bell,
      children: [
        { label: t.remindIn1h, action: () => remindAt(Date.now() + 3_600_000) },
        { label: t.remindTomorrow, action: () => remindAt(tomorrowAt9()) },
        { label: t.remindNextWeek, action: () => remindAt(Date.now() + 7 * 86_400_000) },
        ...(file.remindAt ? [{ label: t.remindClear, action: () => remindAt(null) }] : [])
      ]
    },
    ...(images.length > 0
      ? [
          {
            label: t.convert,
            icon: ImageIcon,
            separated: true,
            children: [
              { label: t.toFormat('JPG'), action: () => convertImages(imageIds, 'jpg') },
              { label: t.toFormat('PNG'), action: () => convertImages(imageIds, 'png') },
              { label: t.toFormat('WebP'), action: () => convertImages(imageIds, 'webp') }
            ]
          },
          { label: t.shrink, icon: ImageDown, action: () => shrinkImages(imageIds) }
        ]
      : []),
    {
      label: t.makeZip,
      icon: Archive,
      separated: images.length === 0,
      action: () => zipFiles(ids)
    },
    {
      label: t.copyToFolder,
      icon: FolderSymlink,
      action: async () => {
        const res = await window.stash.collectFiles(ids)
        if (res.ok) showToast(t.copiedTo(res.copied ?? 0))
      }
    },
    ...(!fromShared && shelves.length > 1
      ? [
          {
            label: t.moveToShelf,
            icon: FolderInput,
            children: shelves
              .filter((s) => s.id !== file.shelfId)
              .map((shelf) => ({ label: shelf.name, action: () => moveFiles(ids, shelf.id) }))
          }
        ]
      : []),
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
    {
      label: t.removeFromShelf,
      icon: Trash2,
      danger: true,
      separated: true,
      action: () => removeFiles(ids)
    }
  ]

  return (
    <Menu
      key={`${contextMenu.fileId}:${contextMenu.x}:${contextMenu.y}`}
      x={contextMenu.x}
      y={contextMenu.y}
      items={items}
      onClose={closeContextMenu}
      caption={many ? t.selectedCount(ids.length) : undefined}
    />
  )
}
