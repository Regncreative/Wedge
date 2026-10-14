import { globalShortcut } from 'electron'
import { getTray } from './tray'
import { togglePanel } from './window'

let registeredHotkey: string | null = null

function register(accelerator: string): boolean {
  try {
    return globalShortcut.register(accelerator, () => {
      togglePanel(getTray()?.getBounds())
    })
  } catch {
    // Invalid accelerator strings throw instead of returning false.
    return false
  }
}

/**
 * Swap the global panel hotkey. When the new accelerator can't be registered
 * (taken by another app, or invalid) the previous one is restored and false
 * is returned, so the user is never left without a working shortcut.
 */
export function reregisterHotkey(accelerator: string): boolean {
  const previous = registeredHotkey
  unregisterHotkeys()
  if (register(accelerator)) {
    registeredHotkey = accelerator
    return true
  }
  console.warn('Failed to register hotkey:', accelerator)
  if (previous && register(previous)) {
    registeredHotkey = previous
  }
  return false
}

export function unregisterHotkeys(): void {
  try {
    globalShortcut.unregisterAll()
  } catch {
    // ignore
  }
  registeredHotkey = null
}
