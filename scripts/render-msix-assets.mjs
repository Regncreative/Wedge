// Renders the logos the Microsoft Store (MSIX) package needs into msix/Assets,
// from assets/brand/wedge-icon.svg:
//
//   node scripts/render-msix-assets.mjs
//
// Unqualified names are the 100% scale; scale-200 and the taskbar sizes
// (targetsize-*, plain and unplated) are picked by resources.pri, which
// scripts/build-msix.mjs makes. Uses Microsoft Edge through Playwright.

import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'msix', 'Assets')
const svg = readFileSync(join(root, 'assets', 'brand', 'wedge-icon.svg'), 'utf8')

// [file, width, height, how much of the height the icon fills]
const LOGOS = [
  ['StoreLogo', 50, 50, 1],
  ['StoreLogo.scale-200', 100, 100, 1],
  ['Square44x44Logo', 44, 44, 0.92],
  ['Square44x44Logo.scale-200', 88, 88, 0.92],
  ['Square150x150Logo', 150, 150, 0.6],
  ['Square150x150Logo.scale-200', 300, 300, 0.6],
  ['Wide310x150Logo', 310, 150, 0.6],
  ['Wide310x150Logo.scale-200', 620, 300, 0.6],
  ['SmallTile', 71, 71, 0.6],
  ['SmallTile.scale-200', 142, 142, 0.6],
  ['LargeTile', 310, 310, 0.6],
  ['LargeTile.scale-200', 620, 620, 0.6],
]
// The taskbar, Start and File Explorer ask for exact sizes.
for (const size of [16, 24, 32, 48, 256]) {
  LOGOS.push([`Square44x44Logo.targetsize-${size}`, size, size, 1])
  LOGOS.push([`Square44x44Logo.targetsize-${size}_altform-unplated`, size, size, 1])
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const [name, w, h, fill] of LOGOS) {
    const s = Math.round(h * fill)
    await page.setViewportSize({ width: w, height: h })
    await page.setContent(
      `<html><body style="margin:0;background:transparent;width:${w}px;height:${h}px;display:grid;place-items:center">` +
        svg.replace('<svg ', `<svg width="${s}" height="${s}" `) +
        `</body></html>`
    )
    await page.screenshot({ path: join(out, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } })
  }
} finally {
  await browser.close()
}
console.log(`${LOGOS.length} logos in ${out}`)
