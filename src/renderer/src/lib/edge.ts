import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import type { EdgeMode, EdgeSide, EdgeState } from './api'

/**
 * The edge window's mode, as the page shows it.
 *
 * The backend sizes the window for a mode (src-tauri/src/panel.rs); the page
 * animates tabs and drawer with CSS. Growing: the window grows first, then
 * the page animates out. Shrinking: the page animates in first, then the
 * window shrinks, so nothing is cut off mid-animation.
 */
interface EdgeStore {
  mode: EdgeMode
  side: EdgeSide
  /** A file drag is in progress somewhere in Windows (the backend's drag watcher). */
  dragging: boolean
  /** Shelf tab under the pointer during a drag. */
  target: string | null
  setTarget: (id: string | null) => void
  /** Tab whose counter just bumped (a drop landed). */
  bump: string | null
  flash: (id: string) => void
  /** Ask for a mode (animating as described above). */
  request: (mode: EdgeMode) => void
}

/** How long the tabs and drawer take to tuck in (styles/globals.css). */
const SHRINK_MS = 320
const SIZE: Record<EdgeMode, number> = { idle: 0, peek: 1, drag: 2, open: 3 }

let shrinkTimer: ReturnType<typeof setTimeout> | null = null
let backendMode: EdgeMode = 'idle'

export const useEdge = create<EdgeStore>((set, get) => ({
  mode: 'idle',
  side: 'right',
  dragging: false,
  target: null,
  setTarget: (id) => {
    if (get().target !== id) set({ target: id })
  },
  bump: null,
  flash: (id) => {
    set({ bump: id })
    setTimeout(() => get().bump === id && set({ bump: null }), 700)
  },
  request: (mode) => {
    if (shrinkTimer) {
      clearTimeout(shrinkTimer)
      shrinkTimer = null
    }
    if (mode === get().mode && mode === backendMode) return
    if (SIZE[mode] >= SIZE[backendMode]) {
      backendMode = mode
      void window.stash.edgeMode(mode).then(() => set({ mode }))
      return
    }
    set({ mode, target: null })
    shrinkTimer = setTimeout(() => {
      shrinkTimer = null
      backendMode = mode
      void window.stash.edgeMode(mode)
    }, SHRINK_MS)
  }
}))

/** Follow the backend: tray, hotkey, the drag watcher, settings. */
export function connectEdge(): () => void {
  const offs: Promise<() => void>[] = []
  void window.stash.edgeState().then((s: EdgeState) => {
    backendMode = s.mode
    useEdge.setState({ mode: s.mode, side: s.side })
  })
  offs.push(
    listen<EdgeState>('edge-mode', ({ payload }) => {
      backendMode = payload.mode
      // A pending tuck-in is overridden by whatever the backend decided.
      if (shrinkTimer) {
        clearTimeout(shrinkTimer)
        shrinkTimer = null
      }
      useEdge.setState({ mode: payload.mode, side: payload.side })
    })
  )
  offs.push(
    listen<boolean>('edge-drag', ({ payload }) => {
      useEdge.setState({ dragging: payload })
    })
  )
  return () => {
    for (const off of offs) void off.then((fn) => fn())
  }
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}

/** Use an accent color, with text on it that reads (dark ink or white). */
export function applyAccent(color: string): void {
  const root = document.documentElement
  root.style.setProperty('--accent', color)
  const lum = luminance(color)
  root.style.setProperty('--on-accent', lum !== null && lum < 0.32 ? '#ffffff' : '#12131a')
}

/**
 * A shelf color as a tab background. Tabs carry dark ink, so dark colors
 * (older shelves) are lightened until the text reads.
 */
export function tabColor(hex: string): string {
  const lum = luminance(hex)
  if (lum === null) return hex
  return lum < 0.32 ? `color-mix(in oklab, ${hex} 55%, white)` : hex
}
