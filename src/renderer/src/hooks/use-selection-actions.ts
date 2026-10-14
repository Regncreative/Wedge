import { useCallback } from 'react'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

/** Actions on the current multi-selection, shared by the selection bar and keyboard shortcuts. */
export function useSelectionActions() {
  const t = useT()

  const removeSelected = useCallback(async () => {
    const { selectedIds, files, askConfirm, refresh, showToast, clearSelection } =
      useStashStore.getState()
    if (selectedIds.length === 0) return
    const single = selectedIds.length === 1 ? files.find((f) => f.id === selectedIds[0]) : null
    const ok = await askConfirm({
      title: t.removeFromShelf,
      message: single ? t.removeFileConfirm(single.name) : t.removeSelectedConfirm(selectedIds.length),
      confirmLabel: t.remove,
      danger: true
    })
    if (!ok) return
    await window.stash.removeFiles(selectedIds)
    clearSelection()
    await refresh()
    showToast(single ? t.removedKept : t.removedMany(selectedIds.length))
  }, [t])

  const pinSelected = useCallback(async () => {
    const { selectedIds, files, refresh } = useStashStore.getState()
    if (selectedIds.length === 0) return
    // Pin all unless every selected file is already pinned (then unpin).
    const allPinned = selectedIds.every((id) => files.find((f) => f.id === id)?.isPinned)
    await window.stash.pinFiles(selectedIds, !allPinned)
    await refresh()
  }, [])

  const openFocused = useCallback(async () => {
    const { focusedId, files, showToast } = useStashStore.getState()
    const file = files.find((f) => f.id === focusedId)
    if (!file || !file.exists) return
    const result = await window.stash.openFile(file.id)
    if (!result.ok) showToast(t.couldNotOpen)
  }, [t])

  return { removeSelected, pinSelected, openFocused }
}
