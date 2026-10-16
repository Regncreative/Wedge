import type { CSSProperties, MouseEvent } from 'react'
import { useMemo } from 'react'
import type { Shelf, StashFile } from '@shared/types'
import { ShelfIcon } from './file-icon'
import { hasThumbnail, useFileVisual } from '@/hooks/use-file-visual'
import { tabColor, useEdge } from '@/lib/edge'
import type { Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'

const AUTOMATIC = new Set(['downloads', 'screenshots', 'phone', 'clipboard'])

// Russian: 1 день, 2 дня, 5 дней.
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

// Short enough for the tab ("KEEPS 30 DAYS", "30 GÜN KALIR", "ХРАНИТ 30 ДНЕЙ").
function expiry(hours: number, lang: string): string {
  const days = hours / 24
  if (hours % 24 === 0) {
    if (lang === 'tr') return `${days} gün`
    if (lang === 'ru') return `${days} ${ruPlural(days, 'день', 'дня', 'дней')}`
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  if (lang === 'tr') return `${hours} saat`
  return lang === 'ru' ? `${hours} ч` : `${hours} h`
}

function subLabel(t: Messages, s: Shelf, lang: string): string {
  if (s.kind === 'pocket') return t.tabSubPocket
  if (s.folder) return t.tabSubShared
  if (s.expireHours) return t.tabSubTemp(expiry(s.expireHours, lang))
  if (AUTOMATIC.has(s.kind)) return t.tabSubAuto
  return t.tabSubNormal
}

/** The last few files in the pocket, as small pictures on its tab. */
function PocketStackItem({ file }: { file: StashFile }) {
  const { icon, thumb } = useFileVisual(file, hasThumbnail(file, true))
  const src = thumb ?? icon
  return src ? <img src={src} alt="" draggable={false} /> : <span />
}

/** Shelf tabs on the screen edge: tucked in, peeking, out for a drop, or holding the drawer. */
export function Tabs() {
  const t = useT()
  const shelves = useStashStore((s) => s.shelves)
  const files = useStashStore((s) => s.files)
  const activeShelfId = useStashStore((s) => s.activeShelfId)
  const lang = useStashStore((s) => s.settings?.language ?? 'en')
  const mode = useEdge((s) => s.mode)
  const target = useEdge((s) => s.target)
  const bump = useEdge((s) => s.bump)

  const ordered = useMemo(
    () => [
      ...shelves.filter((s) => s.kind === 'pocket'),
      ...shelves.filter((s) => s.kind !== 'pocket')
    ],
    [shelves]
  )
  const counts = useMemo(() => {
    const m = new Map<string, StashFile[]>()
    for (const f of files) {
      const list = m.get(f.shelfId)
      if (list) list.push(f)
      else m.set(f.shelfId, [f])
    }
    return m
  }, [files])

  /** Show a shelf in the drawer (opening it if needed). */
  const show = (shelf: Shelf) => {
    const { setActiveShelf, setShowSettings } = useStashStore.getState()
    setShowSettings(false)
    setActiveShelf(shelf.id)
    useEdge.getState().request('open')
  }

  /** A click toggles: the open shelf's tab closes the drawer. */
  const toggle = (shelf: Shelf) => {
    const { showSettings } = useStashStore.getState()
    if (mode === 'open' && activeShelfId === shelf.id && !showSettings) {
      useEdge.getState().request('idle')
      return
    }
    show(shelf)
  }

  const menu = (e: MouseEvent, shelf: Shelf) => {
    e.preventDefault()
    const y = e.clientY
    show(shelf)
    // The drawer may still be opening; place the menu beside the tabs.
    setTimeout(
      () => useStashStore.getState().openShelfMenu(70, y, shelf.id),
      mode === 'open' ? 0 : 60
    )
  }

  return (
    <nav className="tabs" aria-label={t.railLabel}>
      {ordered.map((shelf, i) => {
        const items = counts.get(shelf.id) ?? []
        const pocket = shelf.kind === 'pocket'
        return (
          <button
            key={shelf.id}
            type="button"
            className={cn(
              'tab',
              pocket && 'is-pocket',
              mode === 'open' && activeShelfId === shelf.id && 'is-active',
              target === shelf.id && 'is-target',
              bump === shelf.id && 'is-bump'
            )}
            style={
              { '--c': pocket ? 'var(--paper)' : tabColor(shelf.color), '--i': i } as CSSProperties
            }
            data-drop-shelf={shelf.id}
            aria-label={`${shelf.name}, ${t.filesCount(items.length)}`}
            aria-current={mode === 'open' && activeShelfId === shelf.id ? 'page' : undefined}
            onClick={() => toggle(shelf)}
            onContextMenu={(e) => menu(e, shelf)}
          >
            <span className="tab-ico">
              <ShelfIcon name={shelf.icon} size={17} />
            </span>
            <span className="tab-label">
              <span className="tab-name">{shelf.name}</span>
              <span className="tab-sub">{subLabel(t, shelf, lang)}</span>
            </span>
            {pocket && items.length > 0 && (
              <span className="tab-stack" aria-hidden>
                {items.slice(0, 3).map((f) => (
                  <PocketStackItem key={f.id} file={f} />
                ))}
              </span>
            )}
            <span className="tab-count">{String(items.length).padStart(2, '0')}</span>
          </button>
        )
      })}
    </nav>
  )
}
