import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import type { Preview, StashFile } from '@shared/types'
import { FileTypeIcon } from './file-icon'
import { formatBytes } from '@/lib/format'
import { useStashStore } from '@/stores/stash-store'
import { useT, type Messages } from '@/lib/i18n'

/** The preview body: Windows' thumbnail, the start of a text file, or a big icon. */
export function PreviewBody({ file, t }: { file: StashFile; t: Messages }) {
  const [preview, setPreview] = useState<Preview | null>(null)

  useEffect(() => {
    setPreview(null)
    let alive = true
    void window.stash
      .quickLook(file.id)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setPreview({ kind: 'none' }))
    return () => {
      alive = false
    }
  }, [file.id])

  if (!preview) {
    return <div className="h-5 w-5 animate-pulse rounded-full bg-[var(--accent)] opacity-70" />
  }
  if (preview.kind === 'image') {
    return (
      <img
        src={preview.url}
        alt=""
        className="max-h-full max-w-full object-contain"
        draggable={false}
      />
    )
  }
  if (preview.kind === 'text') {
    return (
      <pre className="scroll-autohide h-full w-full select-text overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[11.5px] leading-relaxed text-[var(--fg)]">
        {preview.text}
      </pre>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <FileTypeIcon file={file} size={72} />
      <p className="text-[12.5px] text-[var(--fg-3)]">{t.noPreview}</p>
    </div>
  )
}

/** Space-bar preview of the focused file; arrows step through the list. */
export function QuickLook() {
  const t = useT()
  const id = useStashStore((s) => s.quickLookId)
  const openQuickLook = useStashStore((s) => s.openQuickLook)
  const files = useStashStore((s) => s.files)
  const getVisibleFiles = useStashStore((s) => s.getVisibleFiles)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => getVisibleFiles(), [files, id, getVisibleFiles])
  const index = visible.findIndex((f) => f.id === id)
  const file = index >= 0 ? visible[index] : files.find((f) => f.id === id)

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
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void window.stash.openFile(id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [id, index, visible, openQuickLook])

  if (!id || !file) return null

  return (
    <motion.div
      className="absolute inset-0 z-[84] flex flex-col bg-[var(--bg-solid)] p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${t.preview}: ${file.name}`}
    >
      <div className="flex items-center gap-2 px-1 pb-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-[var(--fg)]">{file.name}</div>
          <div className="truncate text-[11.5px] text-[var(--fg-3)]">
            {file.isDirectory ? t.folder : formatBytes(file.size)}
            {file.note ? ` · ${file.note}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label={t.open}
          title={t.open}
          onClick={() => void window.stash.openFile(file.id)}
        >
          <ExternalLink size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="btn-icon"
          aria-label={t.close}
          onClick={() => openQuickLook(null)}
        >
          <X size={17} strokeWidth={1.75} />
        </button>
      </div>

      <motion.div
        key={file.id}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14 }}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-[var(--surface)] shadow-[0_0_0_1px_var(--stroke)]"
      >
        <PreviewBody file={file} t={t} />
      </motion.div>

      {visible.length > 1 && index >= 0 && (
        <div className="flex items-center justify-center gap-3 pt-2.5 text-[var(--fg-2)]">
          <button
            type="button"
            disabled={index === 0}
            className="btn-icon disabled:opacity-30"
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
            className="btn-icon disabled:opacity-30"
            aria-label="→"
            onClick={() => openQuickLook(visible[index + 1].id)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </motion.div>
  )
}
