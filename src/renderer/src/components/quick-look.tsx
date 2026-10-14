import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import type { Preview } from '@shared/types'
import { useStashStore } from '@/stores/stash-store'
import { formatBytes } from '@/lib/format'
import { useT } from '@/lib/i18n'

/** Space-bar preview of the focused file; ←/→ step through the list. */
export function QuickLook() {
  const t = useT()
  const id = useStashStore((s) => s.quickLookId)
  const openQuickLook = useStashStore((s) => s.openQuickLook)
  const files = useStashStore((s) => s.files)
  const getVisibleFiles = useStashStore((s) => s.getVisibleFiles)
  const [preview, setPreview] = useState<Preview | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => getVisibleFiles(), [files, id, getVisibleFiles])
  const index = visible.findIndex((f) => f.id === id)
  const file = index >= 0 ? visible[index] : files.find((f) => f.id === id)

  useEffect(() => {
    setPreview(null)
    if (!id) return
    let alive = true
    void window.stash.quickLook(id).then((p) => alive && setPreview(p))
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const step = (d: number) => {
      const next = visible[index + d]
      if (next) {
        openQuickLook(next.id)
        useStashStore.getState().setFocused(next.id)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        openQuickLook(null)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        step(-1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [id, index, visible, openQuickLook])

  if (!id || !file) return null

  return (
    <div
      className="absolute inset-0 z-[84] flex flex-col bg-black/85 p-4 backdrop-blur-md"
      onMouseDown={(e) => e.target === e.currentTarget && openQuickLook(null)}
      role="dialog"
      aria-modal="true"
      aria-label={`${t.preview}: ${file.name}`}
    >
      <div className="flex items-center gap-2 pb-3 text-white">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{file.name}</div>
          <div className="text-[12px] text-white/70">
            {file.isDirectory ? t.folder : formatBytes(file.size)}
            {file.note ? ` · ${file.note}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 hover:bg-white/10"
          aria-label={t.open}
          onClick={() => void window.stash.openFile(file.id)}
        >
          <ExternalLink size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="rounded-lg p-1.5 hover:bg-white/10"
          aria-label={t.close}
          onClick={() => openQuickLook(null)}
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      <motion.div
        key={file.id}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[14px] bg-[var(--card)]"
      >
        {!preview ? (
          <div className="h-5 w-5 animate-pulse rounded-full bg-[var(--accent)] opacity-70" />
        ) : preview.kind === 'image' ? (
          <img src={preview.url} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
        ) : preview.kind === 'text' ? (
          <pre className="scroll-autohide h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 text-[12px] leading-relaxed text-[var(--foreground)]">
            {preview.text}
          </pre>
        ) : (
          <p className="text-[13px] text-[var(--muted-foreground)]">{t.noPreview}</p>
        )}
      </motion.div>

      {visible.length > 1 && index >= 0 && (
        <div className="flex items-center justify-center gap-3 pt-3 text-white/80">
          <button
            type="button"
            disabled={index === 0}
            className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"
            aria-label="←"
            onClick={() => openQuickLook(visible[index - 1].id)}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[12px] tabular-nums">
            {index + 1} / {visible.length}
          </span>
          <button
            type="button"
            disabled={index === visible.length - 1}
            className="rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"
            aria-label="→"
            onClick={() => openQuickLook(visible[index + 1].id)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
