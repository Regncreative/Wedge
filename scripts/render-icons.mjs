// Renders the brand SVGs (assets/brand) to the PNGs the app is built from,
// then lets Tauri make every icon size from the big one.
//
//   node scripts/render-icons.mjs
//
// Uses Microsoft Edge through Playwright (no browser download needed).

import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const brand = (name) => readFileSync(join(root, 'assets', 'brand', name), 'utf8')

async function render(page, svg, size, out) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      svg.replace('<svg ', `<svg width="${size}" height="${size}" `) +
      `</body></html>`
  )
  await page.screenshot({
    path: out,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size }
  })
}

const work = mkdtempSync(join(tmpdir(), 'wedge-icons-'))
mkdirSync(join(root, 'assets', 'store'), { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const big = join(work, 'icon-1024.png')
  await render(page, brand('wedge-icon.svg'), 1024, big)
  await render(page, brand('wedge-tray.svg'), 32, join(root, 'src-tauri', 'icons', 'tray.png'))
  await render(page, brand('wedge-icon.svg'), 192, join(root, 'docs', 'logo.png'))
  // Microsoft Store box art (1:1), uploaded in Partner Center.
  await render(page, brand('wedge-box-art.svg'), 2160, join(root, 'assets', 'store', 'box-art.png'))
  const tauri = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  execFileSync(process.execPath, [tauri, 'icon', big], { cwd: root, stdio: 'inherit' })
  // Only Windows is built; drop the macOS and mobile icons `tauri icon` also writes.
  for (const extra of ['android', 'ios', 'icon.icns']) {
    rmSync(join(root, 'src-tauri', 'icons', extra), { recursive: true, force: true })
  }
} finally {
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}
