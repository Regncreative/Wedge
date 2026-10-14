import { describe, expect, it } from 'vitest'
import { formatDisplay, mapKey, toAccelerator } from '../../src/renderer/src/lib/hotkey'
import { formatWhen } from '../../src/renderer/src/lib/format'

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

describe('formatWhen', () => {
  it('shows the time today, "yesterday" and dates further back', () => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5).getTime()
    expect(formatWhen(today, 'en')).toMatch(/09.05/)
    const yesterday = new Date(today - 86_400_000).getTime()
    expect(formatWhen(yesterday, 'en')).toMatch(/^Yesterday /)
    expect(formatWhen(yesterday, 'tr')).toMatch(/^Dün /)
    expect(formatWhen(new Date(2001, 0, 2).getTime(), 'en')).toContain('2001')
    expect(formatWhen(NaN, 'en')).toBe('')
  })
})
