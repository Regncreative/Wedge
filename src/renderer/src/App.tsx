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
        case 'store':
          showToast(t.updateStore)
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
        <ConfirmDialog />
        <Welcome />
      </DropZone>
    </motion.div>
  )
}
