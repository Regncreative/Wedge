import { app, BrowserWindow } from 'electron'
import { createTray, destroyTray, getTray } from './tray'
import { createPanelWindow, registerWindowIpc, showPanel } from './window'
import { initDatabase, closeDatabase, getSettings } from './database'
import { registerIpcHandlers } from './ipc'
import { syncAutoLaunch } from './auto-launch'
import { reregisterHotkey, unregisterHotkeys } from './hotkey'
import { initUpdater } from './updater'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showPanel(getTray()?.getBounds())
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.stash.app')
  }

  initDatabase()
  registerWindowIpc()
  registerIpcHandlers()

  createTray()
  createPanelWindow()

  const settings = getSettings()
  syncAutoLaunch(settings.startWithWindows)
  reregisterHotkey(settings.openHotkey)

  // Silent launch — panel stays hidden until tray click / hotkey
  initUpdater()
})

app.on('window-all-closed', () => {
  // Stay alive in the tray on Windows/Linux
})

app.on('before-quit', () => {
  unregisterHotkeys()
  destroyTray()
  closeDatabase()
})

app.on('will-quit', () => {
  unregisterHotkeys()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createPanelWindow()
  }
})
