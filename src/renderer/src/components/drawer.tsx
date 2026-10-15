import type { CSSProperties, DragEvent } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { MoreHorizontal, Pin, Plus, Search, Settings, Smartphone, Users, X } from 'lucide-react'
import { FileView } from './file-view'
import { FileThumb } from './file-thumb'
import { SelectionBar } from './selection-bar'
import { SettingsView } from './settings-view'
import { Toast } from './toast'
import { QuickLook } from './quick-look'
import { NoteDialog } from './note-dialog'
import { PhoneSheet } from './phone-sheet'
import { SharedShelfDialog } from './shared-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { Welcome } from './welcome'
import { hasThumbnail, useFileVisual } from '@/hooks/use-file-visual'
import { dragFilesOut } from '@/lib/file-actions'
import { formatBytes } from '@/lib/format'
import { tabColor, useEdge } from '@/lib/edge'
import { useStashStore } from '@/stores/stash-store'
import type { StashFile } from '@shared/types'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

function BundleThumb({ file, i }: { file: StashFile; i: number }) {
  const { icon, thumb } = useFileVisual(file, hasThumbnail(file, true))
  return (
    <div
      className="absolute top-1 h-[46px] w-[46px] overflow-hidden rounded-[9px] shadow-[0_4px_10px_rgba(0,0,0,0.25)]"
      style={{ left: i * 12, transform: `rotate(${(i - 1) * 8}deg)` }}
    >
      <FileThumb file={file} thumb={thumb} icon={icon} />
    </div>
  )
}

/** Everything in the pocket, dragged out in one go. */
function PocketBundle({ files }: { files: StashFile[] }) {
  const t = useT()
  const onDragStart = (e: DragEvent) => {
    e.preventDefault()
    void dragFilesOut(files.filter((f) => f.exists).map((f) => f.id))
  }
  return (
    <div
      draggable
      onDragStart={onDragStart}
      tabIndex={0}
      aria-label={t.pocketBundle(files.length)}
      className="stash-drag-source mx-4 mb-1 flex cursor-grab items-center gap-3.5 rounded-2xl bg-[var(--paper)] p-3.5 text-[var(--ink)]"
    >
      <div className="relative h-[54px] w-[72px] shrink-0">
        {files.slice(0, 3).map((f, i) => (
          <BundleThumb key={f.id} file={f} i={i} />
        ))}
      </div>
      <div className="min-w-0">
        <div className="display-font text-[16px] font-bold leading-tight">
          {t.pocketBundle(files.length)}
        </div>
        <div className="mt-0.5 text-[12px] opacity-70">{t.pocketBundleHint}</div>
      </div>
    </div>
  )
}

/** The shelf pulled out by its tab: header, search and the file cards. */
function ShelfPane() {
  const t = useT()
  const shelf = useStashStore((s) => s.shelves.find((x) => x.id === s.activeShelfId))
  const files = useStashStore((s) => s.files)
  const searchQuery = useStashStore((s) => s.searchQuery)
  const setSearch = useStashStore((s) => s.setSearch)
  const keepOpen = useStashStore((s) => s.keepOpen)
  const getVisibleFiles = useStashStore((s) => s.getVisibleFiles)
  const contentMatches = useStashStore((s) => s.contentMatches)
  const searchRef = useRef<HTMLInputElement>(null)

  const own = useMemo(() => files.filter((f) => f.shelfId === shelf?.id), [files, shelf?.id])
  const total = useMemo(() => own.reduce((n, f) => n + f.size, 0), [own])
  const searching = searchQuery.trim() !== ''
  const results = useMemo(
    () => (searching ? getVisibleFiles().length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searching, searchQuery, files, contentMatches]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!shelf) return null
  const pocket = shelf.kind === 'pocket'
  const color = pocket ? 'var(--fg)' : tabColor(shelf.color)
  const { setPhoneOpen, setShowSettings, setKeepOpen, openShelfMenu, openAddMenu } =
    useStashStore.getState()

  return (
    <>
      <header
        className="grid shrink-0 gap-2.5 px-5 pb-3 pt-4"
        style={{ '--c': color } as CSSProperties}
      >
        <div className="flex items-center gap-0.5">
          <span className="eyebrow min-w-0 flex-1 truncate">
            {searching ? t.searchMeta(results) : t.drawerMeta(own.length, formatBytes(total))}
          </span>
          <button
            type="button"
            className="btn-icon"
            aria-label={t.keepOpen}
            title={t.keepOpen}
            aria-pressed={keepOpen}
            onClick={() => setKeepOpen(!keepOpen)}
          >
            <Pin size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={t.phoneButton}
            title={t.phoneButton}
            onClick={() => setPhoneOpen(true)}
          >
            <Smartphone size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={t.createShelf}
            title={t.createShelf}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              openAddMenu(r.right - 210, r.bottom + 4)
            }}
          >
            <Plus size={17} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={t.settings}
            title={t.settings}
            onClick={() => setShowSettings(true)}
          >
            <Settings size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={t.close}
            title={t.close}
            onClick={() => useEdge.getState().request('idle')}
          >
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex min-w-0 items-end gap-2">
          <h1 className="d-title display-font min-w-0 flex-1 truncate text-[38px] font-extrabold leading-[1] tracking-[-0.025em]">
            {shelf.name}
          </h1>
          <button
            type="button"
            className="btn-icon mb-1"
            aria-label={t.shelfOptions}
            title={t.shelfOptions}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              openShelfMenu(r.right - 236, r.bottom + 4, shelf.id)
            }}
          >
            <MoreHorizontal size={18} strokeWidth={1.75} />
          </button>
        </div>
        {(shelf.folder || pocket) && (
          <div className="chip w-fit max-w-full" title={shelf.folder ?? undefined}>
            {shelf.folder ? (
              <>
                <Users size={13} strokeWidth={1.75} className="shrink-0" />
                <span className="shrink-0">{t.sharedChip}</span>
                <code className="mono truncate text-[10px] text-[var(--fg)]">{shelf.folder}</code>
              </>
            ) : (
              <span className="truncate">{t.pocketHint}</span>
            )}
          </div>
        )}
        <label className="flex h-[38px] items-center gap-2 rounded-[11px] bg-[var(--surface)] px-3 text-[var(--fg-3)] shadow-[var(--shadow-card)] focus-within:shadow-[inset_0_0_0_1.5px_var(--accent)]">
          <Search size={15} strokeWidth={1.75} className="shrink-0" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searchQuery) {
                e.stopPropagation()
                setSearch('')
              }
            }}
            placeholder={t.searchPlaceholder}
            aria-label={t.search}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-3)]"
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-icon h-6 w-6"
              aria-label={t.clearSearch}
              onClick={() => setSearch('')}
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </label>
      </header>
      {pocket && !searching && own.length > 1 && <PocketBundle files={own} />}
      <FileView />
    </>
  )
}

/** The drawer: one shelf at a time (or settings), with its dialogs on top. */
export function Drawer() {
  const t = useT()
  const shelf = useStashStore((s) => s.shelves.find((x) => x.id === s.activeShelfId))
  const showSettings = useStashStore((s) => s.showSettings)
  const dropActive = useStashStore((s) => s.dropActive)
  const mode = useEdge((s) => s.mode)
  const target = useEdge((s) => s.target)
  const color = shelf?.kind === 'pocket' ? 'var(--paper)' : tabColor(shelf?.color ?? '#8d97ff')

  return (
    <section
      className={cn('drawer', mode === 'open' && dropActive && target === shelf?.id && 'is-target')}
      style={{ '--c': color } as CSSProperties}
      data-drop-shelf={showSettings ? undefined : shelf?.id}
      aria-label={shelf ? shelf.name : t.settings}
      aria-hidden={mode !== 'open'}
    >
      {showSettings ? <SettingsView /> : <ShelfPane />}
      <SelectionBar />
      <Toast />
      <QuickLook />
      <NoteDialog />
      <PhoneSheet />
      <SharedShelfDialog />
      <ConfirmDialog />
      <Welcome />
    </section>
  )
}
