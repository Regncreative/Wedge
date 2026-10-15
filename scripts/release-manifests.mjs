// Writes the update manifests for a release:
//   latest.json — read by Stash 2.x (Tauri updater; signature-verified)
//   latest.yml  — read by Stash 1.x (electron-updater), so 1.x installs
//                 upgrade to 2.x; the 2.x installer removes the old app.
//
// Usage: node scripts/release-manifests.mjs <setup.exe> <version> <tag> [notes.md] <outDir>

import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO = 'Regncreative/Wedge'

/**
 * @param {{ version: string, tag: string, fileName: string, size: number,
 *           sha512: string, signature: string, notes: string, date: string }} r
 */
export function buildManifests(r) {
  const url = `https://github.com/${REPO}/releases/download/${r.tag}/${r.fileName}`
  const latestJson = {
    version: r.version,
    notes: r.notes,
    pub_date: r.date,
    platforms: {
      'windows-x86_64': { signature: r.signature, url }
    }
  }
  const latestYml = [
    `version: ${r.version}`,
    'files:',
    `  - url: ${r.fileName}`,
    `    sha512: ${r.sha512}`,
    `    size: ${r.size}`,
    `path: ${r.fileName}`,
    `sha512: ${r.sha512}`,
    `releaseDate: '${r.date}'`,
    ''
  ].join('\n')
  return { latestJson, latestYml }
}

function main() {
  const [setup, version, tag, notesFile, outDir] = process.argv.slice(2)
  if (!setup || !version || !tag || !outDir) {
    console.error('usage: release-manifests.mjs <setup.exe> <version> <tag> [notes.md] <outDir>')
    process.exit(2)
  }
  const bytes = readFileSync(setup)
  const { latestJson, latestYml } = buildManifests({
    version,
    tag,
    fileName: basename(setup),
    size: statSync(setup).size,
    sha512: createHash('sha512').update(bytes).digest('base64'),
    signature: readFileSync(`${setup}.sig`, 'utf8').trim(),
    notes: notesFile ? readFileSync(notesFile, 'utf8').trim() : '',
    date: new Date().toISOString()
  })
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(latestJson, null, 2) + '\n')
  writeFileSync(join(outDir, 'latest.yml'), latestYml)
  console.log(`wrote latest.json and latest.yml for ${version} → ${outDir}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
