import { useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Tabs } from './components/tabs'
import { Drawer } from './components/drawer'
import { ContextMenu } from './components/context-menu'
import { AddShelfMenu, ShelfMenu } from './components/shelf-menu'
import { addPaths } from './lib/file-actions'
import { shelfAt } from './lib/file-drop'
import { connectEdge, useEdge } from './lib/edge'
import { useStashStore } from './stores/stash-store'
import { useT } from './lib/i18n'

/** After a drop on a tab, the tabs stay out this long before tucking in. */
const AFTER_DROP_MS = 900

export default function App() {
  const t = useT()
  const ready = useStashStore((s) => s.ready)
  const init = useStashStore((s) => s.init)
  const mode = useEdge((s) => s.mode)
  const side = useEdge((s) => s.side)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void init()
    return connectEdge()
  }, [init])

  const later = (fn: () => void, ms: number) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(fn, ms)
  }
  const cancelLater = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    leaveTimer.current = null
  }
  /** Back to the tucked-in tabs, unless the drawer is open. */
  const tuckIn = () => {
    const edge = useEdge.getState()
    if (edge.mode === 'drag' || edge.mode === 'peek') edge.request('idle')
  }

  // Files dragged in from Explorer: onto a tab, or into the open drawer.
  useEffect(
    () =>
      window.stash.onFileDrop((event) => {
        const store = useStashStore.getState()
        const edge = useEdge.getState()
        switch (event.type) {
          case 'enter':
            cancelLater()
            store.setDropActive(true)
            // Apps that don't show Windows' drag picture: come out on contact.
            if (edge.mode === 'idle' || edge.mode === 'peek') edge.request('drag')
            edge.setTarget(shelfAt(event.x, event.y))
            break
          case 'over':
            edge.setTarget(shelfAt(event.x, event.y))
            break
          case 'leave':
            store.setDropActive(false)
            edge.setTarget(null)
            if (!edge.dragging) later(tuckIn, 450)
            break
          case 'internal-over':
            edge.setTarget(event.shelfId)
            break
          case 'drop': {
            store.setDropActive(false)
            edge.setTarget(null)
            const target =
              shelfAt(event.x, event.y) ??
              (edge.mode === 'open' ? store.activeShelfId : null) ??
              store.dropShelfId()
            if (target) edge.flash(target)
            void addPaths(event.paths, target)
            if (edge.mode === 'drag') later(tuckIn, AFTER_DROP_MS)
            break
          }
        }
      }),
    []
  )

  // A drag elsewhere in Windows ended without coming here: tuck the tabs in.
  useEffect(
    () =>
      useEdge.subscribe((s, prev) => {
        if (prev.dragging && !s.dragging && !useStashStore.getState().dropActive) {
          later(tuckIn, 300)
        }
        if (!prev.dragging && s.dragging) cancelLater()
      }),
    []
  )

  // Clicking anywhere else closes the drawer (unless it's kept open or a
  // native dialog it opened is up).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (timer) clearTimeout(timer)
      if (focused) return
      timer = setTimeout(() => {
        const { keepOpen, holds, confirm } = useStashStore.getState()
        if (useEdge.getState().mode === 'open' && !keepOpen && holds === 0 && !confirm) {
          useEdge.getState().request('idle')
        }
      }, 150)
    })
    return () => {
      if (timer) clearTimeout(timer)
      void off.then((fn) => fn())
    }
  }, [])

  // Files arriving from watchers, the phone, shared folders or expiry.
  useEffect(
    () =>
      window.stash.onFilesChanged((change) => {
        const { refresh, showToast } = useStashStore.getState()
        void refresh()
        if (change.added === 0) return
        if (change.source === 'phone') showToast(t.phoneReceived(change.added))
        else if (change.source === 'shared') {
          showToast(t.sharedArrived(change.added, change.shelfName))
        } else if (change.source === 'downloads' || change.source === 'screenshots') {
          showToast(t.autoAdded(change.added, change.shelfName))
        }
      }),
    [t]
  )

  // Keys: Ctrl+V pastes onto the open shelf; Esc closes settings, then the drawer.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === 'Escape' && !e.defaultPrevented) {
        const store = useStashStore.getState()
        if (store.contextMenu || store.shelfMenu || store.addMenu || store.confirm) return
        if (store.selectedIds.length > 0 || typing) return
        if (store.showSettings) store.setShowSettings(false)
        else useEdge.getState().request('idle')
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v' || typing) return
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
      const pref = store().settings?.theme
      if (pref === 'system' || !pref) store().setTheme(theme)
    })
    const offNav = window.stash.onNavigateSettings(() => store().setShowSettings(true))
    const offShown = window.stash.onPanelShown(() => {
      store().resetPanelUi()
      void store().refresh()
    })
    const offHidden = window.stash.onPanelHidden(() => store().resetPanelUi())
    const offUpdate = window.stash.onUpdateStatus((status) => {
      const { showToast } = store()
      if (status.state === 'available') showToast(t.updateAvailable(status.version))
      else if (status.state === 'downloaded') showToast(t.updateReady(status.version))
      else if (status.state === 'error') showToast(t.updateError)
    })
    return () => {
      offTheme()
      offNav()
      offShown()
      offHidden()
      offUpdate()
    }
  }, [t])

  return (
    <div
      className="edge-root"
      data-side={side === 'left' ? 'left' : 'right'}
      data-mode={mode}
      onPointerEnter={() => {
        cancelLater()
        if (useEdge.getState().mode === 'idle') useEdge.getState().request('peek')
      }}
      onPointerLeave={() => {
        if (useEdge.getState().mode === 'peek') later(tuckIn, 250)
      }}
    >
      {ready && (
        <>
          <Tabs />
          <Drawer />
          <ContextMenu />
          <ShelfMenu />
          <AddShelfMenu />
        </>
      )}
    </div>
  )
}
