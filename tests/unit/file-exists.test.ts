import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('fs/promises')
  vi.resetModules()
  vi.useRealTimers()
})

describe('checkPath', () => {
  it('reports existing and missing paths', async () => {
    const { checkPath, isReachable } = await import('../../src/main/file-exists')
    const dir = mkdtempSync(join(tmpdir(), 'stash-exists-'))
    const present = join(dir, 'here.txt')
    writeFileSync(present, 'x')
    try {
      expect(await checkPath(present)).toBe(true)
      expect(await checkPath(join(dir, 'gone.txt'))).toBe(false)
      expect(await isReachable(join(dir, 'gone.txt'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gives up on a hanging path (offline share) instead of blocking', async () => {
    const access = vi.fn(() => new Promise<void>(() => {})) // never settles
    vi.doMock('fs/promises', () => ({ access }))
    vi.useFakeTimers()
    const { checkPath } = await import('../../src/main/file-exists')

    const first = checkPath('\\\\offline\\share\\a.txt')
    const second = checkPath('\\\\offline\\share\\a.txt')
    await vi.advanceTimersByTimeAsync(1500)

    expect(await first).toBeNull()
    expect(await second).toBeNull()
    // Concurrent checks of the same path share a single fs probe.
    expect(access).toHaveBeenCalledTimes(1)
  })
})
