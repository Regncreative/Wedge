import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain ESM script without type declarations
import { buildManifests } from '../../scripts/release-manifests.mjs'

const input = {
  version: '2.0.0',
  tag: 'v2.0.0',
  fileName: 'Stash_2.0.0_x64-setup.exe',
  size: 2857962,
  sha512: 'abc+/=',
  signature: 'dW50cnVzdGVkIGNvbW1lbnQ=',
  notes: '### Added\n- Tauri',
  date: '2026-10-14T12:00:00.000Z'
}

describe('release manifests', () => {
  it('points the Tauri updater at the signed installer', () => {
    const { latestJson } = buildManifests(input)
    expect(latestJson.version).toBe('2.0.0')
    expect(latestJson.platforms['windows-x86_64']).toEqual({
      signature: input.signature,
      url: 'https://github.com/Regncreative/Stash/releases/download/v2.0.0/Stash_2.0.0_x64-setup.exe'
    })
  })

  it('writes the electron-updater file that 1.x installs read', () => {
    const { latestYml } = buildManifests(input)
    expect(latestYml).toContain('version: 2.0.0\n')
    expect(latestYml).toContain('  - url: Stash_2.0.0_x64-setup.exe\n    sha512: abc+/=\n    size: 2857962')
    expect(latestYml).toContain('path: Stash_2.0.0_x64-setup.exe\n')
    expect(latestYml).toContain("releaseDate: '2026-10-14T12:00:00.000Z'")
  })
})
