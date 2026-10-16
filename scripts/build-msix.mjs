// Builds the Microsoft Store package (MSIX), unsigned: the Store signs it.
//
//   node scripts/build-msix.mjs [--skip-build]
//
// The package identity comes from Partner Center (Product identity):
//   MSIX_NAME, MSIX_PUBLISHER, MSIX_PUBLISHER_DISPLAY_NAME
// Without them a placeholder identity is used, which is fine for trying the
// package locally but not for the Store.
//
// Output: src-tauri/target/store/Wedge_<version>_x64.msix, and the unpacked
// package in src-tauri/target/store/package (register it with
// `Add-AppxPackage -Register <folder>\AppxManifest.xml` in Developer Mode).

import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const target = join(root, 'src-tauri', 'target', 'store')
const stage = join(target, 'package')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
// The Store wants four numbers with the last one 0.
const msixVersion = `${version.split('-')[0]}.0`

const identity = {
  NAME: process.env.MSIX_NAME || 'Regncreative.Wedge',
  PUBLISHER: process.env.MSIX_PUBLISHER || 'CN=Regncreative',
  PUBLISHER_DISPLAY_NAME: process.env.MSIX_PUBLISHER_DISPLAY_NAME || 'Regncreative',
  VERSION: msixVersion,
}
if (!process.env.MSIX_NAME) console.warn('MSIX_NAME is not set: using a placeholder identity (not for the Store).')

const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })

if (!process.argv.includes('--skip-build')) {
  // A separate target folder, so the regular installer's build is untouched.
  const tauri = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  run(process.execPath, [tauri, 'build', '--no-bundle', '--features', 'store'], { CARGO_TARGET_DIR: target })
  run('cargo', ['build', '--release', '--manifest-path', join('msix', 'shell-ext', 'Cargo.toml')])
}

// The newest Windows SDK tools.
function sdkTool(name) {
  const base = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  const versions = existsSync(base) ? readdirSync(base).filter((v) => /^10\./.test(v)).sort().reverse() : []
  for (const v of versions) {
    const p = join(base, v, 'x64', name)
    if (existsSync(p)) return p
  }
  throw new Error(`${name} not found: install the Windows SDK`)
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
copyFileSync(join(target, 'release', 'wedge.exe'), join(stage, 'wedge.exe'))
copyFileSync(join(root, 'msix', 'shell-ext', 'target', 'release', 'wedge_shell.dll'), join(stage, 'wedge_shell.dll'))
cpSync(join(root, 'msix', 'Assets'), join(stage, 'Assets'), { recursive: true })
copyFileSync(join(root, 'LICENSE'), join(stage, 'LICENSE.txt'))
let manifest = readFileSync(join(root, 'msix', 'AppxManifest.xml'), 'utf8')
for (const [key, value] of Object.entries(identity)) {
  const xml = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  manifest = manifest.replaceAll(`{{${key}}}`, xml)
}
if (manifest.includes('{{')) throw new Error('AppxManifest.xml has an unfilled {{value}}')
writeFileSync(join(stage, 'AppxManifest.xml'), manifest)

// resources.pri picks the right logo size and the unplated taskbar icons.
const priconfig = join(target, 'priconfig.xml')
run(sdkTool('makepri.exe'), ['createconfig', '/cf', priconfig, '/dq', 'en-US', '/pv', '10.0.0', '/o'])
// One package, so every logo size goes into resources.pri (no resource packs).
writeFileSync(priconfig, readFileSync(priconfig, 'utf8').replace(/<packaging>[\s\S]*?<\/packaging>/, ''))
run(sdkTool('makepri.exe'), ['new', '/pr', stage, '/cf', priconfig, '/mn', join(stage, 'AppxManifest.xml'), '/of', join(stage, 'resources.pri'), '/o'])

const msix = join(target, `Wedge_${version}_x64.msix`)
run(sdkTool('makeappx.exe'), ['pack', '/d', stage, '/p', msix, '/o'])
console.log(`\n${msix} (${(statSync(msix).size / 1048576).toFixed(1)} MB), identity ${identity.NAME}, version ${msixVersion}`)
