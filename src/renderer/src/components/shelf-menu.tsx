import type { DragEvent } from 'react'
import {
  Archive,
  Clock,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  MonitorUp,
  Palette,
  Pencil,
  Shapes,
  Trash2,
  Users
} from 'lucide-react'
import { SHELF_ICONS } from './file-icon'
import { Menu, type MenuEntry } from './menu'
import { dragOut } from '@/lib/file-drop'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

const EXPIRY_OPTIONS: (number | null)[] = [null, 24, 24 * 7, 24 * 30]

/** Tab colors (dark ink reads on all of them). New shelves take the next one. */
const SHELF_COLORS: [string, string, string][] = [
  ['#8D97FF', 'İris', 'Iris'],
  ['#43D8AA', 'Nane', 'Mint'],
  ['#FF7FAC', 'Gül', 'Rose'],
  ['#F6BB45', 'Safran', 'Saffron'],
  ['#5CC8FF', 'Gök', 'Sky'],
  ['#FF8A65', 'Mercan', 'Coral'],
  ['#B5E655', 'Limon', 'Lime'],
  ['#C79BFF', 'Leylak', 'Lilac']
]
const PICKABLE_ICONS: [string, string, string][] = [
  ['folder', 'Klasör', 'Folder'],
  ['briefcase', 'Çanta', 'Briefcase'],
  ['heart', 'Kalp', 'Heart'],
  ['star', 'Yıldız', 'Star'],
  ['image', 'Resim', 'Picture'],
  ['music', 'Müzik', 'Music'],
  ['book', 'Kitap', 'Book'],
  ['code', 'Kod', 'Code'],
  ['package', 'Paket', 'Package'],
  ['graduation', 'Okul', 'School'],
  ['clock', 'Saat', 'Clock'],
  ['inbox', 'Gelen kutusu', 'Inbox']
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
  const pocket = shelf.kind === 'pocket'
  const lang = useStashStore.getState().settings?.language ?? 'en'
  const expiryLabel = (h: number | null) =>
    h === null ? t.expiryOff : h === 24 ? t.expiry24h : h === 24 * 7 ? t.expiry7d : t.expiry30d

  const onDragZip = (e: DragEvent) => {
    e.preventDefault()
    if (ids.length === 0) return
    close()
    void dragOut(() => window.stash.startDragZip(ids, shelf.name).then(() => false))
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
    {
      label: t.shelfColor,
      icon: Palette,
      separated: true,
      children: SHELF_COLORS.map(([color, tr, en]) => ({
        label: lang === 'tr' ? tr : en,
        swatch: color,
        checked: shelf.color.toLowerCase() === color.toLowerCase(),
        action: async () => {
          await window.stash.setShelfStyle(shelf.id, shelf.icon, color)
          await refresh()
        }
      }))
    },
    {
      label: t.shelfIcon,
      icon: Shapes,
      children: PICKABLE_ICONS.filter(([i]) => SHELF_ICONS[i]).map(([name, tr, en]) => ({
        label: lang === 'tr' ? tr : en,
        icon: SHELF_ICONS[name],
        action: async () => {
          await window.stash.setShelfStyle(shelf.id, name, shelf.color)
          await refresh()
        }
      }))
    },
    ...(shelf.folder || pocket
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
      disabled: pocket || shelves.filter((s) => s.kind !== 'pocket').length <= 1,
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
        const [color] = SHELF_COLORS[useStashStore.getState().shelves.length % SHELF_COLORS.length]
        const shelf = await window.stash.createShelf({ name: name.trim(), icon: 'folder', color })
        await refresh()
        setActiveShelf(shelf.id)
      }
    },
    { label: t.newSharedShelf, icon: Users, action: () => setSharedDialog(true) }
  ]
  return <Menu x={menu.x} y={menu.y} items={items} onClose={close} width={210} />
}
