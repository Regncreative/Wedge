import { useMemo } from 'react'
import type { FileFilter } from '@shared/types'
import { classifyExtension } from '@shared/types'
import { useStashStore } from '@/stores/stash-store'
import type { Messages } from '@/lib/i18n'
import { useT } from '@/lib/i18n'

const ORDER: Exclude<FileFilter, 'all'>[] = [
  'images',
  'videos',
  'pdf',
  'office',
  'audio',
  'archives',
  'folders',
  'code',
  'executables',
  'unknown'
]

function label(t: Messages, f: Exclude<FileFilter, 'all'>): string {
  return {
    images: t.filterImages,
    videos: t.filterVideos,
    audio: t.filterAudio,
    pdf: t.filterPdf,
    office: t.filterOffice,
    archives: t.filterArchives,
    folders: t.filterFolders,
    code: t.filterCode,
    executables: t.filterExecutables,
    unknown: t.filterOther
  }[f]
}

/** Quick type filters, only for the kinds present in the current view. */
export function FilterChips() {
  const t = useT()
  const files = useStashStore((s) => s.files)
  const activeShelfId = useStashStore((s) => s.activeShelfId)
  const allFiles = useStashStore((s) => s.allFiles)
  const searchQuery = useStashStore((s) => s.searchQuery)
  const filter = useStashStore((s) => s.filter)
  const setFilter = useStashStore((s) => s.setFilter)

  const counts = useMemo(() => {
    const scope =
      allFiles || searchQuery.trim() ? files : files.filter((f) => f.shelfId === activeShelfId)
    const m = new Map<FileFilter, number>()
    for (const f of scope) {
      const k = classifyExtension(f.extension, f.isDirectory)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [files, activeShelfId, allFiles, searchQuery])

  const kinds = ORDER.filter((k) => (counts.get(k) ?? 0) > 0)
  if (kinds.length < 2 && filter === 'all') return null

  return (
    <div
      role="group"
      aria-label={t.filtersLabel}
      className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2.5"
      // Fade the right edge so a cut-off chip reads as "scroll for more".
      style={{ maskImage: 'linear-gradient(to right, black calc(100% - 28px), transparent)' }}
    >
      <button
        type="button"
        className="chip"
        aria-pressed={filter === 'all'}
        onClick={() => setFilter('all')}
      >
        {t.allFiles}
      </button>
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          className="chip"
          aria-pressed={filter === k}
          onClick={() => setFilter(filter === k ? 'all' : k)}
        >
          {label(t, k)}
          <span className="tabular-nums opacity-60">{counts.get(k)}</span>
        </button>
      ))}
    </div>
  )
}
