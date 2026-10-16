import { test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { launchApp, removeProfile, showShelf } from './app'

// Retakes the screenshots for the README and the website, in English,
// Turkish and Russian:  STASH_SCREENS=out-folder npx playwright test screens
// Everything happens on a throwaway profile with made-up files.
const OUT = process.env.STASH_SCREENS ? resolve(process.env.STASH_SCREENS) : ''
test.skip(!OUT, 'set STASH_SCREENS=<folder> to retake the screenshots')
test.setTimeout(240_000)

type Art = 'bloom' | 'arc' | 'lake' | 'dune'
const KB: Record<string, number> = { pdf: 39, xlsx: 18, pptx: 4300, docx: 64, txt: 2 }
interface Copy {
  shelves: { pocket: string; work: string; personal: string; temp: string }
  work: [name: string, art?: Art][]
  pinned: { name: string; note: string; tags: string }
  personal: [string, Art?][]
  temp: [string, Art?][]
  pocket: [string, Art?][]
  labels: { settings: string; createShelf: string; sharedShelf: string }
}
const COPY: Record<'en' | 'tr' | 'ru', Copy> = {
  en: {
    shelves: { pocket: 'Pocket', work: 'Work', personal: 'Personal', temp: 'Temporary' },
    // Added oldest first; the newest show first, after the pinned one.
    work: [
      ['Contract.docx'],
      ['Pitch deck.pptx'],
      ['Budget 2027.xlsx'],
      ['Launch visual.jpg', 'arc'],
      ['Cover design.jpg', 'bloom'],
      ['Proposal — October 2026.pdf']
    ],
    pinned: { name: 'Proposal — October 2026.pdf', note: 'Sign by Friday', tags: 'client' },
    personal: [['Holiday.jpg', 'lake'], ['Recipes.pdf']],
    temp: [['Boarding pass.pdf']],
    pocket: [['Wallpaper.jpg', 'dune'], ['Inventory.xlsx']],
    labels: { settings: 'Settings', createShelf: 'Create shelf', sharedShelf: 'Shared shelf…' }
  },
  tr: {
    shelves: { pocket: 'Cep', work: 'İş', personal: 'Kişisel', temp: 'Geçici' },
    work: [
      ['Sözleşme.docx'],
      ['Sunum.pptx'],
      ['Bütçe 2027.xlsx'],
      ['Lansman görseli.jpg', 'arc'],
      ['Kapak tasarımı.jpg', 'bloom'],
      ['Teklif — Ekim 2026.pdf']
    ],
    pinned: { name: 'Teklif — Ekim 2026.pdf', note: 'Cuma imzalanacak', tags: 'müşteri' },
    personal: [['Tatil.jpg', 'lake'], ['Tarifler.pdf']],
    temp: [['Biniş kartı.pdf']],
    pocket: [['Duvar kâğıdı.jpg', 'dune'], ['Sayım.xlsx']],
    labels: { settings: 'Ayarlar', createShelf: 'Raf oluştur', sharedShelf: 'Paylaşılan raf…' }
  },
  ru: {
    shelves: { pocket: 'Карман', work: 'Работа', personal: 'Личное', temp: 'Временная' },
    work: [
      ['Договор.docx'],
      ['Презентация.pptx'],
      ['Бюджет 2027.xlsx'],
      ['Визуал запуска.jpg', 'arc'],
      ['Дизайн обложки.jpg', 'bloom'],
      ['Предложение — октябрь 2026.pdf']
    ],
    pinned: {
      name: 'Предложение — октябрь 2026.pdf',
      note: 'Подписать до пятницы',
      tags: 'клиент'
    },
    personal: [['Отпуск.jpg', 'lake'], ['Рецепты.pdf']],
    temp: [['Посадочный талон.pdf']],
    pocket: [['Обои.jpg', 'dune'], ['Инвентаризация.xlsx']],
    labels: { settings: 'Настройки', createShelf: 'Создать полку', sharedShelf: 'Общая полка…' }
  }
}

/** A picture drawn in the app's own page, as a JPEG. */
function drawArt(page: Page, art: Art): Promise<string> {
  return page.evaluate((art) => {
    const c = document.createElement('canvas')
    c.width = 1600
    c.height = 1000
    const g = c.getContext('2d')!
    const lin = (x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
      const l = g.createLinearGradient(x0, y0, x1, y1)
      for (const [o, col] of stops) l.addColorStop(o, col)
      return l
    }
    const rad = (x: number, y: number, r: number, stops: [number, string][]) => {
      const l = g.createRadialGradient(x, y, 0, x, y, r)
      for (const [o, col] of stops) l.addColorStop(o, col)
      return l
    }
    if (art === 'bloom') {
      g.fillStyle = lin(0, 0, 1600, 1000, [
        [0, '#1b1f5c'],
        [1, '#0d1033']
      ])
      g.fillRect(0, 0, 1600, 1000)
      g.fillStyle = rad(560, 450, 700, [
        [0, '#c3c8ff'],
        [0.4, '#5d68ea'],
        [1, 'rgba(27,31,92,0)']
      ])
      g.fillRect(0, 0, 1600, 1000)
      g.fillStyle = lin(300, 900, 1300, 200, [
        [0, '#ff9cc2'],
        [1, '#7d5cf0']
      ])
      g.beginPath()
      g.moveTo(200, 1000)
      g.bezierCurveTo(400, 300, 900, 100, 1400, 400)
      g.bezierCurveTo(1100, 450, 800, 700, 700, 1000)
      g.fill()
    } else if (art === 'arc') {
      g.fillStyle = '#07070d'
      g.fillRect(0, 0, 1600, 1000)
      for (const [r, col, w] of [
        [620, '#5d68ea', 90],
        [600, '#ff7fac', 26],
        [590, '#ffd38a', 10]
      ] as const) {
        g.strokeStyle = col
        g.lineWidth = w
        g.shadowColor = col
        g.shadowBlur = 80
        g.beginPath()
        g.arc(800, 1300, r, Math.PI, 2 * Math.PI)
        g.stroke()
      }
    } else if (art === 'lake') {
      g.fillStyle = lin(0, 0, 0, 1000, [
        [0, '#9fd3ff'],
        [0.5, '#e7f3ff'],
        [0.5, '#5aa3d8'],
        [1, '#1f5f8f']
      ])
      g.fillRect(0, 0, 1600, 1000)
      g.fillStyle = '#3e6f5a'
      g.beginPath()
      g.moveTo(0, 500)
      for (let x = 0; x <= 1600; x += 80) g.lineTo(x, 470 - Math.abs(Math.sin(x / 210)) * 120)
      g.lineTo(1600, 500)
      g.fill()
    } else {
      g.fillStyle = lin(0, 0, 0, 1000, [
        [0, '#ffb37a'],
        [0.55, '#ff7fac'],
        [1, '#6b5bd6']
      ])
      g.fillRect(0, 0, 1600, 1000)
      g.fillStyle = 'rgba(255,240,214,.9)'
      g.beginPath()
      g.arc(1100, 430, 120, 0, 2 * Math.PI)
      g.fill()
      g.fillStyle = '#3b2f6b'
      g.beginPath()
      g.moveTo(0, 760)
      g.bezierCurveTo(500, 560, 900, 880, 1600, 640)
      g.lineTo(1600, 1000)
      g.lineTo(0, 1000)
      g.fill()
    }
    return c.toDataURL('image/jpeg', 0.9).split(',')[1]
  }, art)
}

/** The tabs and (when open) the drawer at 2.5× their size, on a transparent background. */
async function shoot(page: Page, file: string, { drawer = true } = {}) {
  await page.waitForTimeout(700)
  const clip = await page.evaluate((drawer) => {
    const rects = Array.from(document.querySelectorAll(drawer ? '.tab, .drawer' : '.tab'), (e) =>
      e.getBoundingClientRect()
    )
    const x = Math.max(0, Math.min(...rects.map((r) => r.left)) - 2),
      y = Math.max(0, Math.min(...rects.map((r) => r.top)) - 2)
    return {
      x,
      y,
      width: Math.min(innerWidth, Math.max(...rects.map((r) => r.right)) + 2) - x,
      height: Math.max(...rects.map((r) => r.bottom)) + 2 - y,
      scale: 2.5
    }
  }, drawer)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 0, g: 0, b: 0, a: 0 }
  })
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip,
    captureBeyondViewport: false
  })
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', {})
  await cdp.detach()
  writeFileSync(file, Buffer.from(data, 'base64'))
}

/** Reload so the panel picks up new settings, then show a shelf. */
async function reloadOn(page: Page, shelf: string) {
  await page.reload()
  await page.waitForFunction(() => Boolean(window.stash))
  await page.locator('.tabs').waitFor()
  await page.waitForTimeout(600)
  await showShelf(page, shelf)
}

for (const lang of ['en', 'tr', 'ru'] as const) {
  test(`screenshots (${lang})`, async () => {
    const copy = COPY[lang]
    const dir = join(OUT, lang)
    mkdirSync(dir, { recursive: true })
    const app = await launchApp(undefined, { STASH_LANG: lang })
    const files = mkdtempSync(join(tmpdir(), 'wedge-screens-'))
    try {
      const { page } = app
      await page.evaluate(() => window.stash.setSettings({ theme: 'dark', onboardingDone: true }))
      // Shelves named in this language, with something on each.
      const shelves = await page.evaluate(() => window.stash.listShelves())
      const byIcon = (icon: string) => shelves.find((s) => s.icon === icon)!
      const ids = {
        pocket: shelves.find((s) => s.kind === 'pocket')!.id,
        work: byIcon('briefcase').id,
        personal: byIcon('heart').id,
        temp: byIcon('clock').id
      }
      for (const key of ['pocket', 'work', 'personal', 'temp'] as const) {
        await page.evaluate(([id, name]) => window.stash.renameShelf(id, name), [
          ids[key],
          copy.shelves[key]
        ] as const)
      }
      for (const key of ['work', 'personal', 'temp', 'pocket'] as const) {
        const paths: string[] = []
        for (const [name, art] of copy[key]) {
          const p = join(files, name)
          const ext = name.split('.').pop()!
          writeFileSync(
            p,
            art
              ? Buffer.from(await drawArt(page, art), 'base64')
              : Buffer.alloc((KB[ext] ?? 20) * 1024, 32)
          )
          paths.push(p)
        }
        await page.evaluate(([paths, id]) => window.stash.addFiles(paths, id), [
          paths,
          ids[key]
        ] as const)
      }
      await page.evaluate((id) => window.stash.setShelfExpiry(id, 24), ids.temp)
      const work = await page.evaluate((id) => window.stash.listFiles(id), ids.work)
      const pinned = work.find((f) => f.name === copy.pinned.name)!
      await page.evaluate(
        ([id, note, tags]) =>
          Promise.all([window.stash.pinFile(id, true), window.stash.setNote(id, note, tags)]),
        [pinned.id, copy.pinned.note, copy.pinned.tags] as const
      )
      await reloadOn(page, copy.shelves.work)
      await page.waitForTimeout(2500) // previews come from Windows
      await shoot(page, join(dir, 'drawer-dark.png'))

      await page.evaluate(() => window.stash.setSettings({ theme: 'light' }))
      await reloadOn(page, copy.shelves.work)
      await page.waitForTimeout(2500)
      await shoot(page, join(dir, 'drawer-light.png'))
      await page.evaluate(() => window.stash.setSettings({ theme: 'dark' }))
      await reloadOn(page, copy.shelves.work)

      await showShelf(page, copy.shelves.pocket)
      await page.waitForTimeout(1800)
      await shoot(page, join(dir, 'pocket.png'))

      await page.getByRole('button', { name: copy.labels.settings, exact: true }).click()
      await page.waitForTimeout(900)
      await shoot(page, join(dir, 'settings.png'))
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      await showShelf(page, copy.shelves.work)
      await page.getByRole('button', { name: copy.labels.createShelf, exact: true }).click()
      await page.getByText(copy.labels.sharedShelf, { exact: true }).click()
      await page.waitForTimeout(900)
      await shoot(page, join(dir, 'shared-shelf.png'))
      await page.keyboard.press('Escape')

      // The tabs on their own, as they slide out during a drag.
      // An empty Pocket shows its whole name.
      const pocket = await page.evaluate((id) => window.stash.listFiles(id), ids.pocket)
      await page.evaluate(
        (ids) => window.stash.removeFiles(ids),
        pocket.map((f) => f.id)
      )
      await page.waitForTimeout(600)
      await page.evaluate(() => window.stash.edgeMode('drag'))
      await page.waitForTimeout(1200)
      await shoot(page, join(dir, 'edge-tabs.png'), { drawer: false })
    } finally {
      await app.close()
      removeProfile(app.userData)
      removeProfile(files)
    }
  })
}
