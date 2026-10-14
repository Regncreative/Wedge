import { useEffect, useState } from 'react'
import type { StashFile } from '@shared/types'
import { IMAGE_EXTS, VIDEO_EXTS } from '@shared/types'

/**
 * Icons and thumbnails come from Windows (shell icons, Explorer thumbnails).
 * They are cached for the session so virtualized rows don't refetch them.
 */
interface Cache {
  done: Map<string, string | null>
  pending: Map<string, Promise<string | null>>
}
const icons: Cache = { done: new Map(), pending: new Map() }
const thumbs: Cache = { done: new Map(), pending: new Map() }

function load(
  { done, pending }: Cache,
  key: string,
  fetch: () => Promise<string | null>
): Promise<string | null> {
  if (done.has(key)) return Promise.resolve(done.get(key) ?? null)
  const running = pending.get(key)
  if (running) return running
  const p = fetch()
    .catch(() => null)
    .then((url) => {
      // Failures aren't cached: the shell may simply have been busy.
      if (url) done.set(key, url)
      pending.delete(key)
      return url
    })
  pending.set(key, p)
  return p
}

/** Files with a meaningful picture: images and videos (and, in grids, documents). */
export function hasThumbnail(file: StashFile, documents: boolean): boolean {
  if (!file.exists || file.isDirectory) return false
  const ext = file.extension.toLowerCase()
  if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) return true
  return documents && ['pdf', 'docx', 'pptx', 'xlsx'].includes(ext)
}

export function useFileVisual(
  file: StashFile,
  wantThumb: boolean
): { icon: string | null; thumb: string | null } {
  const [icon, setIcon] = useState<string | null>(() => icons.done.get(file.id) ?? null)
  const [thumb, setThumb] = useState<string | null>(() => thumbs.done.get(file.id) ?? null)

  useEffect(() => {
    if (!file.exists || file.isDirectory) return
    let alive = true
    void load(icons, file.id, () => window.stash.getFileIcon(file.id)).then(
      (url) => alive && setIcon(url)
    )
    return () => {
      alive = false
    }
  }, [file.id, file.exists, file.isDirectory])

  useEffect(() => {
    if (!wantThumb) return
    let alive = true
    void load(thumbs, file.id, () => window.stash.getPreview(file.id)).then(
      (url) => alive && setThumb(url)
    )
    return () => {
      alive = false
    }
  }, [file.id, wantThumb])

  return { icon, thumb: wantThumb ? thumb : null }
}
