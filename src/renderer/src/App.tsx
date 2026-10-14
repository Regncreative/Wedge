import { useIdleOpacity } from '@/hooks/use-idle-opacity'
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Header } from './components/header'
import { ShelfBar } from './components/shelf-bar'
import { FileList } from './components/file-list'
import { DropZone } from './components/drop-zone'
import { ContextMenu } from './components/context-menu'
import { Toast } from './components/toast'
import { ConfirmDialog } from './components/confirm-dialog'
import { SettingsPanel } from './components/settings-panel'
import { Welcome } from './components/welcome'
import { NoteDialog } from './components/note-dialog'
import { QuickLook } from './components/quick-look'
import { ShelfMenu } from './components/shelf-menu'
import { PhoneSheet } from './components/phone-sheet'
import { useStashStore } from './stores/stash-store'
import { useT } from './lib/i18n'

export default function App() {
  const t = useT()
  const ready = useStashStore((s) => s.ready)
  const init = useStashStore((s) => s.init)
  const showSettings = useStashStore((s) => s.showSettings)
  const setShowSettings = useStashStore((s) => s.setShowSettings)
  const setTheme = useStashStore((s) => s.setTheme)
  const showToast = useStashStore((s) => s.showToast)
  const idleOpacity = useStashStore((s) => s.settings?.idleOpacity ?? 0.4)
  const idleTimeoutSec = useStashStore((s) => s.settings?.idleTimeoutSec ?? 10)

  useIdleOpacity(ready, idleOpacity, idleTimeoutSec)

  useEffect(() => {
    void init()
  }, [init])

  // The backend uses the selection for the paste-into-dialog shortcut.
  useEffect(
    () =>
      useStashStore.subscribe((s, prev) => {
        if (s.selectedIds !== prev.selectedIds) void window.stash.setSelection(s.selectedIds)
      }),
    []
  )

  // Files arriving from watchers, the phone, sync or expiry.
  useEffect(
    () =>
      window.stash.onFilesChanged((change) => {
        const { refresh, showToast } = useStashStore.getState()
        void refresh()
        if (change.added === 0) return
        if (change.source === 'phone') showToast(t.phoneReceived(change.added))
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
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      e.preventDefault()
      const { activeShelfId, refresh, showToast } = useStashStore.getState()
      const res = await window.stash.pasteClipboard(activeShelfId)
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
    const unsubTheme = window.stash.onThemeChanged((theme) => {
      const mode = useStashStore.getState().settings?.theme
      if (mode === 'system' || !mode) {
        setTheme(theme)
      }
    })
    const unsubNav = window.stash.onNavigateSettings(() => setShowSettings(true))
    const resetPanelUi = () => useStashStore.getState().resetPanelUi()
    const unsubShown = window.stash.onPanelShown(resetPanelUi)
    const unsubHidden = window.stash.onPanelHidden(resetPanelUi)
    const unsubUpdate = window.stash.onUpdateStatus((status) => {
      switch (status.state) {
        case 'available':
          showToast(t.updateAvailable(status.version))
          break
        case 'downloading':
          if (status.percent === 0 || status.percent % 25 === 0 || status.percent >= 99) {
            showToast(t.updateDownloading(status.percent))
          }
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
      unsubTheme()
      unsubNav()
      unsubShown()
      unsubHidden()
      unsubUpdate()
    }
  }, [setShowSettings, setTheme, showToast, t])

  if (!ready) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="h-5 w-5 animate-pulse rounded-full bg-[var(--accent)] opacity-70" />
      </div>
    )
  }

  return (
    <motion.div
      className="app-shell relative"
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <DropZone>
        <Header />
        {showSettings ? (
          <SettingsPanel />
        ) : (
          <>
            <ShelfBar />
            <FileList />
          </>
        )}
        <ContextMenu />
        <Toast />
        <ShelfMenu />
        <NoteDialog />
        <QuickLook />
        <PhoneSheet />
        <ConfirmDialog />
        <Welcome />
      </DropZone>
    </motion.div>
  )
}
