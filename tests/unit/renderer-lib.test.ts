import { describe, expect, it } from 'vitest'
import { formatDisplay, mapKey, toAccelerator } from '../../src/renderer/src/lib/hotkey'
import { formatWhen } from '../../src/renderer/src/lib/format'
import { droppedText } from '../../src/renderer/src/lib/dropped-text'

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

describe('droppedText', () => {
  const drag = (data: Record<string, string>) => (format: string) => data[format] ?? ''
  // Stands in for the browser's DOMParser, which tests don't have.
  const anchor = (html: string) => /<a [^>]*>([^<]*)<\/a>/.exec(html)?.[1]

  it('takes a link with the title the browser gives it', () => {
    const url = 'https://example.com/notes'
    const html = `<a href="${url}">Meeting\n  notes</a>`
    expect(
      droppedText(drag({ 'text/uri-list': url, 'text/plain': url, 'text/html': html }), anchor)
    ).toEqual({ text: url, title: 'Meeting notes' })
    expect(
      droppedText(drag({ 'text/uri-list': url, 'text/x-moz-url': `${url}\nFrom Firefox` }), anchor)
    ).toEqual({ text: url, title: 'From Firefox' })
  })

  it('skips the comments in a link list, and goes without a title when there is none', () => {
    expect(
      droppedText(drag({ 'text/uri-list': '# from a page\r\nhttps://a.org/x\r\n' }), anchor)
    ).toEqual({
      text: 'https://a.org/x'
    })
  })

  it("keeps text as it is, and doesn't take other kinds of addresses for links", () => {
    expect(
      droppedText(
        drag({ 'text/uri-list': 'file:///C:/x.txt', 'text/plain': ' Call Ada\nabout it ' })
      )
    ).toEqual({ text: ' Call Ada\nabout it ' })
    expect(droppedText(drag({ 'text/plain': ' \n ' }))).toBeNull()
    expect(droppedText(drag({}))).toBeNull()
  })
})
