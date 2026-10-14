import type { DragEvent } from 'react'
import {
  Archive,
  Clock,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  MonitorUp,
  Pencil,
  Trash2,
  Users
} from 'lucide-react'
import { Menu, type MenuEntry } from './menu'
import { dragOut } from '@/lib/file-drop'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

const EXPIRY_OPTIONS: (number | null)[] = [null, 24, 24 * 7, 24 * 30]

/** New shelves take the next color, so the rail stays easy to scan. */
const SHELF_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16'
]

/** Right-click menu for a shelf (rail) and the header's shelf options. */
export function ShelfMenu() {
  const t = useT()
  const menu = useStashStore((s) => s.shelfMenu)
  const close = useStashStore((s) => s.closeShelfMenu)
  const shelves = useStashStore((s) => s.shelves)
  const files = useStashStore((s) => s.files)

  const shelf = shelves.find((s) => s.id === menu?.shelfId)
  if (!menu || !shelf) return null

  const { refresh, askPrompt, askConfirm, showToast } = useStashStore.getState()
  const ids = files.filter((f) => f.shelfId === shelf.id && f.exists).map((f) => f.id)
  const expiryLabel = (h: number | null) =>
    h === null ? t.expiryOff : h === 24 ? t.expiry24h : h === 24 * 7 ? t.expiry7d : t.expiry30d

  const onDragZip = (e: DragEvent) => {
    e.preventDefault()
    if (ids.length === 0) return
    close()
    void dragOut(() => window.stash.startDragZip(ids, shelf.name))
  }

  const items: MenuEntry[] = [
    {
      label: t.renameShelf,
      icon: Pencil,
      action: async () => {
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
      }
    },
    ...(shelf.folder
      ? [
          {
            label: t.openFolder,
            icon: FolderOpen,
            action: async () => {
              const res = await window.stash.openShelfFolder(shelf.id)
              if (!res.ok) showToast(t.folderUnavailable)
            }
          }
        ]
      : []),
    {
      label: t.openAll,
      icon: ExternalLink,
      disabled: ids.length === 0,
      action: () => window.stash.openFiles(ids)
    },
    { label: t.dragAsZip, icon: Archive, disabled: ids.length === 0, onDragStart: onDragZip },
    ...(shelf.folder
      ? []
      : [
          {
            label: t.tempShelf,
            icon: Clock,
            children: EXPIRY_OPTIONS.map((h) => ({
              label: expiryLabel(h),
              checked: shelf.expireHours === h,
              action: async () => {
                await window.stash.setShelfExpiry(shelf.id, h)
                await refresh()
              }
            }))
          }
        ]),
    {
      label: t.pinToDesktop,
      icon: MonitorUp,
      action: () => window.stash.openWidget(shelf.id)
    },
    {
      label: t.deleteShelf(shelf.name),
      icon: Trash2,
      danger: true,
      separated: true,
      disabled: shelves.length <= 1,
      action: async () => {
        const ok = await askConfirm({
          title: t.deleteShelf(shelf.name),
          message: shelf.folder
            ? t.deleteSharedShelfConfirm(shelf.name)
            : t.deleteShelfConfirm(shelf.name),
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
      }
    }
  ]

  return (
    <Menu
      key={`${shelf.id}:${menu.x}:${menu.y}`}
      x={menu.x}
      y={menu.y}
      items={items}
      onClose={close}
      caption={shelf.name}
    />
  )
}

/** The rail's "+" menu: a plain shelf or a shared (folder) shelf. */
export function AddShelfMenu() {
  const t = useT()
  const menu = useStashStore((s) => s.addMenu)
  const close = useStashStore((s) => s.closeAddMenu)
  if (!menu) return null
  const { askPrompt, refresh, setActiveShelf, setSharedDialog } = useStashStore.getState()

  const items: MenuEntry[] = [
    {
      label: t.newShelf,
      icon: FolderPlus,
      action: async () => {
        const name = await askPrompt({
          title: t.newShelf,
          message: '',
          promptPlaceholder: t.shelfName,
          confirmLabel: t.createShelf
        })
        if (!name?.trim()) return
        const color = SHELF_COLORS[useStashStore.getState().shelves.length % SHELF_COLORS.length]
        const shelf = await window.stash.createShelf({ name: name.trim(), icon: 'folder', color })
        await refresh()
        setActiveShelf(shelf.id)
      }
    },
    { label: t.newSharedShelf, icon: Users, action: () => setSharedDialog(true) }
  ]
  return <Menu x={menu.x} y={menu.y} items={items} onClose={close} width={210} />
}
