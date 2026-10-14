import type { DragEvent } from 'react'
import { useEffect, useState } from 'react'
import type { StashFile } from '@shared/types'
import { FileTypeIcon } from '@/components/file-icon'
import { getMessages, type Messages } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Theme, accent and strings for the secondary windows (drop shelf, widgets). */
export function useWindowSetup(): Messages | null {
  const [t, setT] = useState<Messages | null>(null)
  useEffect(() => {
    void Promise.all([window.stash.getSettings(), window.stash.getSystemTheme()]).then(
      ([settings, system]) => {
        const theme = settings.theme === 'system' ? system : settings.theme
        const root = document.documentElement
        root.classList.toggle('light', theme === 'light')
        root.classList.toggle('dark', theme === 'dark')
        root.style.setProperty('--accent', settings.accentColor)
        root.lang = settings.language
        setT(getMessages(settings.language))
      }
    )
  }, [])
  return t
}

/** Drag files out of a secondary window; resolves when the drag ends. */
export function dragOut(e: DragEvent, ids: string[]) {
  e.preventDefault()
  if (ids.length === 0) return
  document.body.dataset.stashDragging = '1'
  void window.stash.startDrag(ids).finally(() => {
    delete document.body.dataset.stashDragging
  })
}

/** Add dropped files to a shelf; ignores our own outbound drags. */
export function useDropInto(shelfId: string | null, after: () => void) {
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!shelfId) return
    return window.stash.onFileDrop(async (event) => {
      if (document.body.dataset.stashDragging === '1') return
      if (event.type === 'enter') setOver(event.paths.length > 0)
      else if (event.type === 'leave') setOver(false)
      else if (event.type === 'drop') {
        setOver(false)
        if (event.paths.length > 0) {
          await window.stash.addFiles(event.paths, shelfId)
          after()
        }
      }
    })
  }, [shelfId, after])
  return over
}

export function MiniFileRow({ file, t }: { file: StashFile; t: Messages }) {
  const [icon, setIcon] = useState<string | null>(null)
  useEffect(() => {
    if (!file.exists) return
    let alive = true
    void window.stash.getFileIcon(file.id).then((url) => alive && setIcon(url))
    return () => {
      alive = false
    }
  }, [file.id, file.exists])

  return (
    <li
      draggable={file.exists}
      onDragStart={(e) => dragOut(e, [file.id])}
      onDoubleClick={() => file.exists && void window.stash.openFile(file.id)}
      title={file.absolutePath}
      className={cn(
        'flex cursor-grab items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-[var(--pill)]',
        !file.exists && 'cursor-not-allowed opacity-50'
      )}
      aria-label={file.exists ? file.name : `${file.name} (${t.fileNotFound})`}
    >
      {icon ? (
        <img src={icon} alt="" className="h-6 w-6 shrink-0 object-contain" draggable={false} />
      ) : (
        <div className="scale-[0.6] -m-2.5">
          <FileTypeIcon file={file} />
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--foreground)]">{file.name}</span>
    </li>
  )
}
