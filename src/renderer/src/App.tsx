import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useIdleOpacity } from '@/hooks/use-idle-opacity'
import { Rail } from './components/rail'
import { ShelfHeader } from './components/shelf-header'
import { FilterChips } from './components/filter-chips'
import { FileView } from './components/file-view'
import { SelectionBar } from './components/selection-bar'
import { DropOverlay } from './components/drop-overlay'
import { ContextMenu } from './components/context-menu'
import { AddShelfMenu, ShelfMenu } from './components/shelf-menu'
import { SettingsView } from './components/settings-view'
import { Toast } from './components/toast'
import { ConfirmDialog } from './components/confirm-dialog'
import { NoteDialog } from './components/note-dialog'
import { QuickLook } from './components/quick-look'
import { PhoneSheet } from './components/phone-sheet'
import { SharedShelfDialog } from './components/shared-dialog'
import { Welcome } from './components/welcome'
import { addPaths } from './lib/file-actions'
import { shelfAt } from './lib/file-drop'
import { useStashStore } from './stores/stash-store'
import { useT } from './lib/i18n'

export default function App() {
  const t = useT()
  const ready = useStashStore((s) => s.ready)
  const init = useStashStore((s) => s.init)
  const showSettings = useStashStore((s) => s.showSettings)
  const idleOpacity = useStashStore((s) => s.settings?.idleOpacity ?? 0.4)
  const idleTimeoutSec = useStashStore((s) => s.settings?.idleTimeoutSec ?? 10)

  useIdleOpacity(ready, idleOpacity, idleTimeoutSec)

  useEffect(() => {
    void init()
  }, [init])

  // Files dragged in from Explorer: onto the current shelf, or onto a shelf in the rail.
  useEffect(
    () =>
      window.stash.onFileDrop((event) => {
        const store = useStashStore.getState()
        switch (event.type) {
          case 'enter':
            store.setDropActive(true)
            store.setDropTarget(shelfAt(event.x, event.y))
            break
          case 'over':
            store.setDropTarget(shelfAt(event.x, event.y))
            break
          case 'leave':
            store.setDropActive(false)
            break
          case 'internal-over':
            store.setDropTarget(event.shelfId)
            break
          case 'drop': {
            store.setDropActive(false)
            const target = shelfAt(event.x, event.y) ?? store.dropShelfId()
            void addPaths(event.paths, target)
            break
          }
        }
      }),
    []
  )

  // Files arriving from watchers, the phone, shared folders or expiry.
  useEffect(
    () =>
      window.stash.onFilesChanged((change) => {
        const { refresh, showToast } = useStashStore.getState()
        void refresh()
        if (change.added === 0) return
        if (change.source === 'phone') showToast(t.phoneReceived(change.added))
        else if (change.source === 'shared')
          showToast(t.sharedArrived(change.added, change.shelfName))
        else if (change.source === 'downloads' || change.source === 'screenshots') {
          showToast(t.autoAdded(change.added, change.shelfName))
        }
      }),
    [t]
  )

  // Ctrl+V in the panel: files, images, links or text from the clipboard.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      const { dropShelfId, refresh, showToast } = useStashStore.getState()
      const res = await window.stash.pasteClipboard(dropShelfId())
      await refresh()
      const messages = {
        files: t.pastedFiles(res.added),
        image: t.pastedImage,
        link: t.pastedLink,
        text: t.pastedText,
        empty: t.clipboardEmpty
      }
      showToast(res.added === 0 && res.kind === 'files' ? t.alreadyOnShelf : messages[res.kind])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t])

  useEffect(() => {
    const store = () => useStashStore.getState()
    const offTheme = window.stash.onThemeChanged((theme) => {
      const mode = store().settings?.theme
      if (mode === 'system' || !mode) store().setTheme(theme)
    })
    const offNav = window.stash.onNavigateSettings(() => store().setShowSettings(true))
    const reset = () => store().resetPanelUi()
    const offShown = window.stash.onPanelShown(() => {
      reset()
      void store().refresh()
    })
    const offHidden = window.stash.onPanelHidden(reset)
    const offUpdate = window.stash.onUpdateStatus((status) => {
      const { showToast } = store()
      switch (status.state) {
        case 'available':
          showToast(t.updateAvailable(status.version))
          break
        case 'downloaded':
          showToast(t.updateReady(status.version))
          break
        case 'dev':
          showToast(t.updateDev)
          break
        case 'error':
          showToast(t.updateError)
          break
        default:
          break
      }
    })
    return () => {
      offTheme()
      offNav()
      offShown()
      offHidden()
      offUpdate()
    }
  }, [t])

  if (!ready) {
    return (
      <div className="app-shell items-center justify-center">
        <div className="h-5 w-5 animate-pulse rounded-full bg-[var(--accent)] opacity-70" />
      </div>
    )
  }

  return (
    <motion.div
      className="app-shell"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
    >
      <Rail />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {showSettings ? (
          <SettingsView />
        ) : (
          <>
            <ShelfHeader />
            <FilterChips />
            <FileView />
            <SelectionBar />
            <DropOverlay />
          </>
        )}
        <Toast />
      </main>
      <ContextMenu />
      <ShelfMenu />
      <AddShelfMenu />
      <NoteDialog />
      <QuickLook />
      <PhoneSheet />
      <SharedShelfDialog />
      <ConfirmDialog />
      <Welcome />
    </motion.div>
  )
}
