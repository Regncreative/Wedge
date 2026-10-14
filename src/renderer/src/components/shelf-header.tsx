import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, LayoutGrid, LayoutList, MoreHorizontal, Search, Users, X } from 'lucide-react'
import { ShelfIcon } from './file-icon'
import { formatBytes } from '@/lib/format'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

function expiryLabel(hours: number, lang: string): string {
  if (hours % 24 === 0) {
    const days = hours / 24
    return lang === 'tr' ? `${days} gün` : `${days} ${days === 1 ? 'day' : 'days'}`
  }
  return lang === 'tr' ? `${hours} saat` : `${hours} h`
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Title, counts, search, view switch, shelf options and close. */
export function ShelfHeader() {
  const t = useT()
  const shelf = useStashStore((s) => s.shelves.find((x) => x.id === s.activeShelfId))
  const allFiles = useStashStore((s) => s.allFiles)
  const files = useStashStore((s) => s.files)
  const lang = useStashStore((s) => s.settings?.language ?? 'en')
  const searchQuery = useStashStore((s) => s.searchQuery)
  const setSearch = useStashStore((s) => s.setSearch)
  const viewMode = useStashStore((s) => s.viewMode)
  const setViewMode = useStashStore((s) => s.setViewMode)
  const openShelfMenu = useStashStore((s) => s.openShelfMenu)
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const own = useMemo(
    () => (allFiles ? files : files.filter((f) => f.shelfId === shelf?.id)),
    [files, allFiles, shelf?.id]
  )
  const total = useMemo(() => own.reduce((n, f) => n + f.size, 0), [own])

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    const close = () => setSearchOpen(false)
    const offShown = window.stash.onPanelShown(close)
    const offHidden = window.stash.onPanelHidden(close)
    return () => {
      offShown()
      offHidden()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        inputRef.current?.focus()
      } else if (e.key === 'Escape' && (searchOpen || searchQuery)) {
        setSearchOpen(false)
        setSearch('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen, searchQuery, setSearch])

  const title = allFiles ? t.allFiles : (shelf?.name ?? '')
  const searching = searchOpen || searchQuery !== ''

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-1.5 pl-4 pr-2.5">
      <AnimatePresence mode="wait" initial={false}>
        {searching ? (
          <motion.div
            key="search"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="relative min-w-0 flex-1"
          >
            <Search
              size={15}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-3)]"
            />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => !searchQuery && setSearchOpen(false)}
              placeholder={t.searchPlaceholder}
              aria-label={t.search}
              className="field h-9 pl-8 pr-8 text-[13px]"
            />
            <button
              type="button"
              className="btn-icon absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSearch('')
                setSearchOpen(false)
              }}
              aria-label={t.clearSearch}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="title"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            {shelf && !allFiles && (
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                style={{ background: `color-mix(in srgb, ${shelf.color} 18%, transparent)` }}
              >
                <ShelfIcon name={shelf.icon} color={shelf.color} size={17} />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="display-font truncate text-[15.5px] font-semibold leading-tight text-[var(--fg)]">
                {title}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] leading-tight text-[var(--fg-3)]">
                <span className="shrink-0">
                  {t.filesCount(own.length)}
                  {total > 0 ? ` · ${formatBytes(total)}` : ''}
                </span>
                {!allFiles && shelf?.folder && (
                  <span
                    className="flex min-w-0 items-center gap-1 text-[var(--accent-text)]"
                    title={shelf.folder}
                  >
                    <Users size={11} strokeWidth={2} className="shrink-0" />
                    <span className="truncate">
                      {t.sharedBadge} · {folderName(shelf.folder)}
                    </span>
                  </span>
                )}
                {!allFiles && !shelf?.folder && shelf?.expireHours ? (
                  <span className="flex items-center gap-1">
                    <Clock size={11} strokeWidth={2} />
                    {t.expiresBadge(expiryLabel(shelf.expireHours, lang))}
                  </span>
                ) : null}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!searching && (
        <button
          type="button"
          className="btn-icon"
          aria-label={t.search}
          title={`${t.search} (Ctrl+F)`}
          onClick={() => setSearchOpen(true)}
        >
          <Search size={17} strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        className="btn-icon"
        aria-label={viewMode === 'grid' ? t.viewList : t.viewGrid}
        title={viewMode === 'grid' ? t.viewList : t.viewGrid}
        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
      >
        {viewMode === 'grid' ? (
          <LayoutList size={17} strokeWidth={1.75} />
        ) : (
          <LayoutGrid size={17} strokeWidth={1.75} />
        )}
      </button>
      {shelf && !allFiles && (
        <button
          type="button"
          className="btn-icon"
          aria-label={t.shelfOptions}
          title={t.shelfOptions}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openShelfMenu(r.right - 236, r.bottom + 4, shelf.id)
          }}
        >
          <MoreHorizontal size={17} strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        className="btn-icon"
        aria-label={t.close}
        title={t.close}
        onClick={() => void window.stash.hideWindow()}
      >
        <X size={17} strokeWidth={1.75} />
      </button>
    </header>
  )
}
