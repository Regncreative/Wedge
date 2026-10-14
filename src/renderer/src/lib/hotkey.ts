/** Keyboard event → Electron accelerator helpers for the hotkey recorder. */

export function mapKey(e: Pick<KeyboardEvent, 'key'>): string | null {
  if (e.key === 'Control') return 'Control'
  if (e.key === 'Alt') return 'Alt'
  if (e.key === 'Shift') return 'Shift'
  // The Windows key; CommandOrControl would resolve to Ctrl on Windows.
  if (e.key === 'Meta') return 'Super'
  if (e.key === ' ') return 'Space'
  if (e.key === 'Escape') return null
  if (e.key.length === 1) return e.key.toUpperCase()

  const special: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert'
  }
  if (special[e.key]) return special[e.key]
  if (/^F\d{1,2}$/.test(e.key)) return e.key
  return e.key.length <= 16 ? e.key : null
}

export function isModifier(part: string): boolean {
  return (
    part === 'Control' ||
    part === 'Alt' ||
    part === 'Shift' ||
    part === 'CommandOrControl' ||
    part === 'Super' ||
    part === 'Meta'
  )
}

export function toAccelerator(parts: string[]): string {
  const order = ['Control', 'CommandOrControl', 'Super', 'Alt', 'Shift']
  const mods = order.filter((m) => parts.includes(m))
  const keys = parts.filter((p) => !isModifier(p))
  return [...mods, ...keys].join('+')
}

export function formatDisplay(accel: string): string {
  return accel
    .replaceAll('CommandOrControl', 'Ctrl')
    .replaceAll('Control', 'Ctrl')
    .replaceAll('Super', 'Win')
    .replaceAll('+', ' + ')
}
