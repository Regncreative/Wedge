import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { Shelf, StashFile } from '@shared/types'
import { ShelfIcon } from '@/components/file-icon'
import { StashMark } from '@/components/rail'
import { shelfAt } from '@/lib/file-drop'
import { cn } from '@/lib/utils'
import { useWindowSetup } from './mini'

const HEADER = 46
const ROW = 46
const PAD = 14
const MAX_ROWS = 8

type Mode = { kind: 'idle' } | { kind: 'open' } | { kind: 'done'; message: string }

/**
 * The edge handle: a slim tab on the screen edge. Files dragged onto it open
 * a list of shelves to drop on; a click opens the panel; dragging it up or
 * down moves it.
 */
export function EdgeView({ side }: { side: 'left' | 'right' }) {
  const t = useWindowSetup()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [preferred, setPreferred] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [hover, setHover] = useState(false)
  const collapseTimer = useRef<number | null>(null)
  const drag = useRef<{ startY: number; moved: boolean } | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('edge-page')
  }, [])

  const collapse = useCallback(() => {
    setMode({ kind: 'idle' })
    setTarget(null)
    void window.stash.edgeExpand(false)
  }, [])

  const open = useCallback(async () => {
    if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
    setMode((m) => (m.kind === 'open' ? m : { kind: 'open' }))
    const [list, files, settings] = await Promise.all([
      window.stash.listShelves(),
      window.stash.listFiles(null),
      window.stash.getSettings()
    ])
    const m = new Map<string, number>()
    files.forEach((f: StashFile) => m.set(f.shelfId, (m.get(f.shelfId) ?? 0) + 1))
    setShelves(list)
    setCounts(m)
    setPreferred(settings.defaultShelfId || list[0]?.id || null)
    const rows = Math.min(list.length, MAX_ROWS)
    await window.stash.edgeExpand(true, HEADER + rows * ROW + PAD)
  }, [])

  useEffect(
    () =>
      window.stash.onFileDrop((event) => {
        switch (event.type) {
          case 'enter':
            void open()
            break
          case 'over':
            if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
            setTarget(shelfAt(event.x, event.y))
            break
          case 'leave':
            // Leaving briefly (e.g. while the window grows) shouldn't close it.
            if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
            collapseTimer.current = window.setTimeout(collapse, 350)
            break
          case 'drop': {
            if (collapseTimer.current) window.clearTimeout(collapseTimer.current)
            const id = shelfAt(event.x, event.y) ?? preferred
            if (!id) return collapse()
            void window.stash.addFiles(event.paths, id).then((res) => {
              setMode({
                kind: 'done',
                message: t
                  ? res.added > 0
                    ? t.edgeAdded(res.added, res.shelfName)
                    : t.alreadyOnShelf
                  : ''
              })
              window.setTimeout(collapse, 1300)
            }, collapse)
            break
          }
        }
      }),
    [open, collapse, preferred, t]
  )

  if (!t) return null
  const right = side === 'right'

  if (mode.kind === 'idle') {
    return (
      <div
        className={cn(
          'flex h-screen w-screen items-center',
          right ? 'justify-end' : 'justify-start'
        )}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { startY: e.screenY, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          if (!d.moved && Math.abs(e.screenY - d.startY) > 4) d.moved = true
          if (d.moved) void window.stash.edgeMove(e.screenY * window.devicePixelRatio, false)
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d?.moved) void window.stash.edgeMove(e.screenY * window.devicePixelRatio, true)
          else void window.stash.edgeClick()
        }}
        title={t.edgeOpen}
        role="button"
        aria-label={t.edgeOpen}
      >
        <motion.div
          animate={{ width: hover ? 12 : 6, opacity: hover ? 1 : 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={cn('h-[76px]', right ? 'rounded-l-full' : 'rounded-r-full')}
          style={{
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--accent) 75%, white) 0%, var(--accent) 100%)',
            boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 45%, transparent)'
          }}
        />
      </div>
    )
  }

  const highlighted = target ?? preferred

  return (
    <div className="h-screen w-screen p-1.5">
      <motion.div
        initial={{ opacity: 0, x: right ? 24 : -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 36 }}
        className="flyout flex h-full flex-col overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-solid)' }}
      >
        <AnimatePresence mode="wait">
          {mode.kind === 'done' ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                <Check size={22} strokeWidth={2.5} />
              </span>
              <span className="text-[13px] font-semibold text-[var(--fg)]">{mode.message}</span>
            </motion.div>
          ) : (
            <motion.div key="list" className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 px-3.5" style={{ height: HEADER }}>
                <StashMark size={20} />
                <span className="display-font text-[13px] font-semibold text-[var(--fg)]">
                  {t.edgeDropTitle}
                </span>
              </div>
              <ul className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
                {shelves.map((s) => (
                  <li
                    key={s.id}
                    data-drop-shelf={s.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[10px] px-2 transition-colors duration-75',
                      highlighted === s.id
                        ? 'bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent)]'
                        : ''
                    )}
                    style={{ height: ROW - 4, marginBottom: 4 }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]"
                      style={{ background: `color-mix(in srgb, ${s.color} 20%, transparent)` }}
                    >
                      <ShelfIcon name={s.icon} color={s.color} size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--fg)]">
                      {s.name}
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--fg-3)]">
                      {counts.get(s.id) ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
