import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface DropZoneProps {
  children: ReactNode
}

/**
 * Files dragged in from Explorer arrive as native drop events from Tauri
 * (with real paths), not as HTML5 drag events.
 */
export function DropZone({ children }: DropZoneProps) {
  const t = useT()
  const setDropActive = useStashStore((s) => s.setDropActive)
  const dropActive = useStashStore((s) => s.dropActive)

  useEffect(() => {
    return window.stash.onFileDrop(async (event) => {
      // Our own outbound drags pass over the panel too; ignore them.
      if (document.body.dataset.stashDragging === '1') return

      if (event.type === 'enter') {
        setDropActive(event.paths.length > 0)
        return
      }
      if (event.type === 'leave') {
        setDropActive(false)
        return
      }
      if (event.type !== 'drop') return

      setDropActive(false)
      if (event.paths.length === 0) return

      const { activeShelfId, settings, refresh, showToast } = useStashStore.getState()
      const result = await window.stash.addFiles(
        event.paths,
        activeShelfId || settings?.defaultShelfId
      )
      await refresh()
      if (result.added > 0) {
        showToast(t.filesAdded(result.added, result.shelfName))
      } else if (result.skipped > 0) {
        showToast(t.alreadyOnShelf)
      }
    })
  }, [setDropActive, t])

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col', dropActive && 'drop-active')}>
      {children}
    </div>
  )
}
