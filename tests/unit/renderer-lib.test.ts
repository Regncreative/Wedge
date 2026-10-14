import { describe, expect, it } from 'vitest'
import { formatDisplay, mapKey, toAccelerator } from '../../src/renderer/src/lib/hotkey'

describe('hotkey helpers', () => {
  const record = (...keys: string[]) =>
    toAccelerator(keys.map((key) => mapKey({ key })).filter((k): k is string => k !== null))

  it('orders modifiers canonically', () => {
    expect(record('Shift', 'Control', ' ')).toBe('Control+Shift+Space')
  })

  it('records the Windows key as Super, not Ctrl', () => {
    expect(record('Meta', 'e')).toBe('Super+E')
    expect(formatDisplay('Super+E')).toBe('Win + E')
  })

  it('maps special keys and ignores Escape', () => {
    expect(mapKey({ key: 'ArrowUp' })).toBe('Up')
    expect(mapKey({ key: 'F12' })).toBe('F12')
    expect(mapKey({ key: 'Escape' })).toBeNull()
  })

  it('formats accelerators for display', () => {
    expect(formatDisplay('CommandOrControl+Shift+Space')).toBe('Ctrl + Shift + Space')
  })
})
