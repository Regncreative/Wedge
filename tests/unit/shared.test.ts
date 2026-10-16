import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  classifyExtension,
  formatBytes,
  normalizeSettings
} from '../../src/shared/types'
import { dictionaries, resolveSystemLanguage } from '../../src/shared/i18n'

describe('normalizeSettings', () => {
  it('fills defaults for missing or empty input', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps idle opacity and timeout into their ranges', () => {
    expect(normalizeSettings({ idleOpacity: 0 }).idleOpacity).toBe(0.1)
    expect(normalizeSettings({ idleOpacity: 1 }).idleOpacity).toBe(0.7)
    expect(normalizeSettings({ idleTimeoutSec: 2.6 }).idleTimeoutSec).toBe(5)
    expect(normalizeSettings({ idleTimeoutSec: 600 }).idleTimeoutSec).toBe(60)
  })

  it('replaces invalid values from old databases or bad IPC input', () => {
    const s = normalizeSettings({
      idleOpacity: NaN,
      fileSort: 'bogus' as never,
      language: 'de' as never,
      notifications: undefined
    })
    expect(s.idleOpacity).toBe(DEFAULT_SETTINGS.idleOpacity)
    expect(s.fileSort).toBe('added')
    expect(s.language).toBe('en')
    expect(s.notifications).toBe(true)
  })

  it('keeps the edge handle on a known side (on by default, right)', () => {
    expect(normalizeSettings({}).edgeHandle).toBe('right')
    expect(normalizeSettings({ edgeHandle: 'left' }).edgeHandle).toBe('left')
    expect(normalizeSettings({ edgeHandle: 'off' }).edgeHandle).toBe('off')
    expect(normalizeSettings({ edgeHandle: 'top' as never }).edgeHandle).toBe('right')
  })
})

describe('classifyExtension', () => {
  it.each([
    ['PNG', false, 'images'],
    ['mp4', false, 'videos'],
    ['7z', false, 'archives'],
    ['pdf', false, 'pdf'],
    ['xlsx', false, 'office'],
    ['exe', false, 'executables'],
    ['ts', false, 'code'],
    ['xyz', false, 'unknown'],
    ['', true, 'folders']
  ])('%s (dir=%s) → %s', (ext, isDir, expected) => {
    expect(classifyExtension(ext, isDir)).toBe(expected)
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [10 * 1024 * 1024, '10 MB']
  ])('%d → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('resolveSystemLanguage', () => {
  it.each([
    ['tr-TR', 'tr'],
    ['ru-RU', 'ru'],
    ['ru', 'ru'],
    ['en-US', 'en'],
    ['uk-UA', 'en'],
    [null, 'en']
  ])('%s → %s', (locale, expected) => {
    expect(resolveSystemLanguage(locale)).toBe(expected)
  })
})

describe('translations', () => {
  it('every language defines exactly the same keys', () => {
    const [base, ...others] = Object.values(dictionaries)
    for (const dict of others) {
      expect(Object.keys(dict).sort()).toEqual(Object.keys(base).sort())
    }
  })
})
