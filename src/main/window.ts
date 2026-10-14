import { Rectangle } from 'electron'
import {
  BrowserWindow,
  screen,
  nativeTheme,
  app,
  ipcMain
} from 'electron'
import { join } from 'path'
import { IpcChannels } from '../shared/ipc'

const PANEL_WIDTH = 420
const PANEL_HEIGHT = 650

let panelWindow: BrowserWindow | null = null
let isPinned = false
let currentOpacity = 1
let opacityAnim: ReturnType<typeof setInterval> | null = null

export function setQuitting(_value: boolean): void {
  // Kept for callers.
}

export function getPanelWindow(): BrowserWindow | null {
  return panelWindow
}

export function isPanelPinned(): boolean {
  return isPinned
}

/** Call before opening OS dialogs (e.g. Properties) so always-on-top can drop briefly. */
export function beginExternalDialog(): void {
  // no-op placeholder for dialog flow; opacity stays managed by renderer.
}

function stopOpacityAnim(): void {
  if (opacityAnim) {
    clearInterval(opacityAnim)
    opacityAnim = null
  }
}

/** Animate BrowserWindow opacity (ease-out). Pass animate=false for instant set. */
export function setPanelOpacity(opacity: number, animate = true): void {
  if (!panelWindow || panelWindow.isDestroyed()) return
  const clamped = Math.min(1, Math.max(0.1, opacity))

  stopOpacityAnim()

  if (!animate || Math.abs(clamped - currentOpacity) < 0.01) {
    currentOpacity = clamped
    panelWindow.setOpacity(clamped)
    return
  }

  const start = currentOpacity
  const delta = clamped - start
  const duration = 480
  const startedAt = Date.now()

  opacityAnim = setInterval(() => {
    if (!panelWindow || panelWindow.isDestroyed()) {
      stopOpacityAnim()
      return
    }
    const t = Math.min(1, (Date.now() - startedAt) / duration)
    const eased = 1 - (1 - t) ** 3
    currentOpacity = start + delta * eased
    panelWindow.setOpacity(currentOpacity)
    if (t >= 1) {
      currentOpacity = clamped
      panelWindow.setOpacity(clamped)
      stopOpacityAnim()
    }
  }, 16)
}

export function createPanelWindow(): BrowserWindow {
  panelWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: '#00000000',
    thickFrame: false,
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  currentOpacity = 1
  panelWindow.setOpacity(1)

  if (process.env.ELECTRON_RENDERER_URL) {
    panelWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    panelWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  panelWindow.on('closed', () => {
    panelWindow = null
  })

  panelWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  return panelWindow
}

export function positionPanelNearTray(trayBounds?: Rectangle): void {
  if (!panelWindow) return

  // Anchor to the display that hosts the tray/cursor.
  const anchorPoint =
    trayBounds && trayBounds.width > 0
      ? { x: Math.round(trayBounds.x + trayBounds.width / 2), y: trayBounds.y }
      : screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(anchorPoint)
  const workArea = display.workArea
  // The window has a 12px transparent gutter for the CSS shadow,
  // so 0 here still leaves ~12px of visual breathing room.
  const margin = 0

  // Detect taskbar edge from the difference between full bounds and work area.
  const bounds = display.bounds
  const taskbarBottom = workArea.y + workArea.height < bounds.y + bounds.height
  const taskbarTop = workArea.y > bounds.y

  let x: number
  let y: number

  // Horizontal: follow the tray icon, otherwise hug the right corner (PC Manager style).
  if (trayBounds && trayBounds.width > 0) {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - PANEL_WIDTH / 2)
  } else {
    x = workArea.x + workArea.width - PANEL_WIDTH - margin
  }

  // Vertical: always flush against the taskbar edge — no floating gap.
  if (taskbarTop) {
    y = workArea.y + margin
  } else {
    // Bottom taskbar (default) or side taskbar → sit just above the work area bottom.
    void taskbarBottom
    y = workArea.y + workArea.height - PANEL_HEIGHT - margin
  }

  // Clamp inside the work area so it never spills off-screen.
  x = Math.max(workArea.x + margin, Math.min(x, workArea.x + workArea.width - PANEL_WIDTH - margin))
  y = Math.max(workArea.y + margin, Math.min(y, workArea.y + workArea.height - PANEL_HEIGHT - margin))

  panelWindow.setPosition(x, y, false)
}

export function showPanel(trayBounds?: Rectangle): void {
  if (!panelWindow) {
    createPanelWindow()
  }
  if (!panelWindow) return

  positionPanelNearTray(trayBounds)
  panelWindow.setAlwaysOnTop(true, 'pop-up-menu')
  setPanelOpacity(1, false)
  panelWindow.show()
  panelWindow.focus()
  panelWindow.webContents.send(IpcChannels.WINDOW_SHOWN)
}

export function hidePanel(): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send(IpcChannels.WINDOW_HIDE)
  }
  panelWindow?.hide()
}

export function togglePanel(trayBounds?: Rectangle): void {
  if (panelWindow?.isVisible()) {
    hidePanel()
  } else {
    showPanel(trayBounds)
  }
}

export function setPinned(pinned: boolean): void {
  isPinned = pinned
  if (panelWindow) {
    panelWindow.setAlwaysOnTop(true, pinned ? 'floating' : 'pop-up-menu')
  }
}

export function registerWindowIpc(): void {
  ipcMain.handle(IpcChannels.WINDOW_HIDE, () => {
    hidePanel()
  })

  ipcMain.handle(IpcChannels.WINDOW_PIN, (_e, pinned: boolean) => {
    setPinned(pinned)
    return isPinned
  })

  ipcMain.handle(IpcChannels.WINDOW_IS_PINNED, () => isPinned)

  ipcMain.handle(IpcChannels.WINDOW_SET_OPACITY, (_e, opacity: number, animate?: boolean) => {
    setPanelOpacity(typeof opacity === 'number' ? opacity : 1, animate !== false)
    return true
  })

  ipcMain.handle(IpcChannels.THEME_GET, () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })

  nativeTheme.on('updated', () => {
    panelWindow?.webContents.send(
      IpcChannels.THEME_CHANGED,
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  })
}

export function isDev(): boolean {
  return !app.isPackaged
}
