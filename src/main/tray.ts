import { Tray, Menu, nativeImage, app, NativeImage } from 'electron'
import { join } from 'path'
import { showPanel, togglePanel, hidePanel, getPanelWindow } from './window'
import { checkForUpdates, getUpdateStatus, installUpdateNow } from './updater'
import { getSettings } from './database'
import { getMessages } from '../shared/i18n'

let tray: Tray | null = null

function createTrayIcon(): NativeImage {
  const size = 16
  const iconPath = join(__dirname, '../../resources/tray-icon.png')
  try {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) {
      return img.resize({ width: 16, height: 16 })
    }
  } catch {
    // fall through
  }

  const buffer = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const inStack =
        (y >= 3 && y <= 5 && x >= 3 && x <= 12) ||
        (y >= 7 && y <= 9 && x >= 3 && x <= 12) ||
        (y >= 11 && y <= 13 && x >= 3 && x <= 12)
      if (inStack) {
        buffer[i] = 0
        buffer[i + 1] = 120
        buffer[i + 2] = 212
        buffer[i + 3] = 255
      } else {
        buffer[i] = 0
        buffer[i + 1] = 0
        buffer[i + 2] = 0
        buffer[i + 3] = 0
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size })
}

function buildContextMenu(): Menu {
  const t = getMessages(getSettings().language)
  return Menu.buildFromTemplate([
    {
      label: t.trayOpen,
      click: () => {
        const bounds = tray?.getBounds()
        showPanel(bounds)
      }
    },
    { type: 'separator' },
    {
      label: t.traySettings,
      click: () => {
        const bounds = tray?.getBounds()
        showPanel(bounds)
        setTimeout(() => {
          getPanelWindow()?.webContents.send('navigate:settings')
        }, 150)
      }
    },
    {
      label: t.trayCheckUpdates,
      click: () => {
        const status = getUpdateStatus()
        if (status.state === 'downloaded') {
          installUpdateNow()
          return
        }
        void checkForUpdates(true)
      }
    },
    { type: 'separator' },
    {
      label: t.trayQuit,
      click: () => {
        hidePanel()
        app.quit()
      }
    }
  ])
}

export function createTray(): Tray {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Stash')
  tray.setContextMenu(buildContextMenu())

  tray.on('click', () => {
    const bounds = tray?.getBounds()
    togglePanel(bounds)
  })

  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildContextMenu())
  })

  return tray
}

export function getTray(): Tray | null {
  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
