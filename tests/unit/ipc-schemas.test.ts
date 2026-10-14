import { describe, expect, it } from 'vitest'
import * as v from '../../src/main/ipc-schemas'

describe('IPC schemas', () => {
  it('accepts well-formed settings patches', () => {
    expect(
      v.settingsPatch.parse({ theme: 'light', idleOpacity: 0.3, updateChannel: 'beta' })
    ).toEqual({ theme: 'light', idleOpacity: 0.3, updateChannel: 'beta' })
  })

  it('rejects unknown settings keys and wrong types', () => {
    expect(v.settingsPatch.safeParse({ isAdmin: true }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ startWithWindows: 'yes' }).success).toBe(false)
    expect(v.settingsPatch.safeParse({ accentColor: 'red; background:url(x)' }).success).toBe(
      false
    )
    expect(v.settingsPatch.safeParse({ idleOpacity: Infinity }).success).toBe(false)
  })

  it('trims shelf names and refuses empty ones', () => {
    expect(v.shelfInput.parse({ name: '  Docs  ' }).name).toBe('Docs')
    expect(v.shelfInput.safeParse({ name: '   ' }).success).toBe(false)
    expect(v.shelfInput.safeParse({ name: 'x'.repeat(101) }).success).toBe(false)
  })

  it('bounds ids and path lists', () => {
    expect(v.id.safeParse('').success).toBe(false)
    expect(v.id.safeParse(42).success).toBe(false)
    expect(v.optionalShelfId.safeParse(null).success).toBe(true)
    expect(v.optionalShelfId.safeParse(undefined).success).toBe(true)
    expect(v.filePaths.safeParse(['C:\\a.txt']).success).toBe(true)
    expect(v.filePaths.safeParse([123]).success).toBe(false)
  })
})
