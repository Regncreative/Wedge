import type { ConvertedImage } from '@shared/types'
import { useStashStore } from '@/stores/stash-store'
import { getMessages, type Messages } from './i18n'
import { dragOut } from './file-drop'
import { formatBytes } from './format'
import type { ImageFormat } from './api'

/**
 * File operations shared by menus, the selection bar, keyboard shortcuts and
 * drops. Each refreshes the store and reports the outcome with a toast.
 */

function messages(): Messages {
  return getMessages(useStashStore.getState().settings?.language)
}

function shelfOf(id: string) {
  return useStashStore.getState().shelves.find((s) => s.id === id)
}

function isShared(shelfId: string): boolean {
  return Boolean(shelfOf(shelfId)?.folder)
}

/** Add dropped or picked paths to a shelf (copied in for shared shelves). */
export async function addPaths(paths: string[], shelfId: string | null): Promise<void> {
  if (paths.length === 0) return
  const t = messages()
  const { refresh, showToast } = useStashStore.getState()
  if (shelfId && isShared(shelfId)) showToast(t.copying, true)
  try {
    const result = await window.stash.addFiles(paths, shelfId)
    await refresh()
    if (result.added > 0) showToast(t.filesAdded(result.added, result.shelfName))
    else if (result.skipped > 0) showToast(t.alreadyOnShelf)
    else useStashStore.getState().clearToast()
  } catch {
    useStashStore.getState().showToast(t.fileNotFound)
  }
}

/** Remove files from their shelves, after confirming. Shared files go to the Recycle Bin. */
export async function removeFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const t = messages()
  const { files, askConfirm, refresh, showToast, clearSelection } = useStashStore.getState()
  const targets = files.filter((f) => ids.includes(f.id))
  const shared = targets.filter((f) => isShared(f.shelfId))
  const single = targets.length === 1 ? targets[0] : null
  const message =
    shared.length > 0
      ? single
        ? t.removeSharedConfirm(single.name)
        : t.removeSharedManyConfirm(targets.length)
      : single
        ? t.removeFileConfirm(single.name)
        : t.removeSelectedConfirm(targets.length)
  const ok = await askConfirm({
    title: t.removeFromShelf,
    message,
    confirmLabel: shared.length > 0 ? t.delete : t.remove,
    danger: true
  })
  if (!ok) return
  let failed = false
  try {
    await window.stash.removeFiles(ids)
  } catch {
    failed = true
  }
  clearSelection()
  await refresh()
  if (failed) showToast(t.recycleFailed)
  else if (shared.length > 0) showToast(t.recycled(shared.length))
  else showToast(single ? t.removedKept : t.removedMany(targets.length))
}

export async function pinFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { files, refresh } = useStashStore.getState()
  // Pin all unless every one is already pinned (then unpin).
  const allPinned = ids.every((id) => files.find((f) => f.id === id)?.isPinned)
  await window.stash.pinFiles(ids, !allPinned)
  await refresh()
}

/** Move files to a shelf; onto a shared shelf they are copied into its folder. */
export async function moveFiles(ids: string[], shelfId: string): Promise<void> {
  const t = messages()
  const { files, refresh, showToast } = useStashStore.getState()
  const shelf = shelfOf(shelfId)
  const movable = files.filter((f) => ids.includes(f.id) && f.shelfId !== shelfId)
  if (!shelf || movable.length === 0) return
  if (shelf.folder) showToast(t.copying, true)
  let moved = 0
  for (const f of movable) {
    try {
      await window.stash.moveFile(f.id, shelfId)
      moved++
    } catch {
      // Files on a shared shelf live in its folder and can't be moved out.
    }
  }
  await refresh()
  if (moved === 0) useStashStore.getState().clearToast()
  else showToast(shelf.folder ? t.copiedToShared(shelf.name) : t.movedTo(shelf.name))
}

/**
 * Drag files out to other apps. Dropping them on a shelf tab moves them
 * there; files that leave the pocket for another app leave the pocket.
 */
export async function dragFilesOut(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { shelf, dropped } = await dragOut(() => window.stash.startDrag(ids))
  if (shelf) {
    await moveFiles(ids, shelf)
    return
  }
  if (dropped) await leavePocket(ids)
}

/** Take files off the pocket once they were dropped somewhere else. */
export async function leavePocket(ids: string[]): Promise<void> {
  const t = messages()
  const { files, shelves, refresh, showToast } = useStashStore.getState()
  const pocket = shelves.find((s) => s.kind === 'pocket')
  const leaving = files.filter((f) => ids.includes(f.id) && f.shelfId === pocket?.id)
  if (leaving.length === 0) return
  try {
    await window.stash.removeFiles(leaving.map((f) => f.id))
  } catch {
    // Already gone.
  }
  await refresh()
  showToast(t.pocketLeft(leaving.length))
}

function sizeReport(t: Messages, results: ConvertedImage[]): string {
  const before = results.reduce((n, r) => n + r.before, 0)
  const after = results.reduce((n, r) => n + r.after, 0)
  return results.length === 1
    ? t.convertedOne(results[0].name, formatBytes(before), formatBytes(after))
    : t.convertedMany(results.length, formatBytes(before), formatBytes(after))
}

export async function convertImages(ids: string[], format: ImageFormat): Promise<void> {
  const t = messages()
  const { refresh, showToast } = useStashStore.getState()
  const res = await window.stash.convertImages(ids, format)
  await refresh()
  showToast(res.results.length > 0 ? sizeReport(t, res.results) : t.convertFailed)
}

export async function shrinkImages(ids: string[]): Promise<void> {
  const t = messages()
  const { refresh, showToast } = useStashStore.getState()
  const res = await window.stash.shrinkImages(ids)
  await refresh()
  if (res.results.length > 0) showToast(sizeReport(t, res.results))
  else if (res.alreadySmall > 0) showToast(t.alreadySmall)
  else showToast(t.convertFailed)
}

export async function zipFiles(ids: string[]): Promise<void> {
  const t = messages()
  const { refresh, showToast } = useStashStore.getState()
  const res = await window.stash.zipFiles(ids)
  await refresh()
  showToast(res.ok ? t.zipDone : t.fileNotFound)
}

export async function openFile(id: string): Promise<void> {
  const t = messages()
  const res = await window.stash.openFile(id)
  if (!res.ok) {
    useStashStore.getState().showToast(res.error === 'missing' ? t.fileNotFound : t.couldNotOpen)
  }
}
