import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { formatDisplay, isModifier, mapKey, toAccelerator } from '@/lib/hotkey'

interface HotkeyRecorderProps {
  value: string
  onChange: (accelerator: string) => void
}

export function HotkeyRecorder({ value, onChange }: HotkeyRecorderProps) {
  const t = useT()
  const [recording, setRecording] = useState(false)
  const [draft, setDraft] = useState<string[]>([])

  const stop = useCallback(() => {
    setRecording(false)
    setDraft([])
  }, [])

  useEffect(() => {
    if (!recording) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        stop()
        return
      }

      const part = mapKey(e)
      if (!part) return

      setDraft((prev) => {
        if (prev.includes(part)) return prev
        const next = [...prev, part].slice(0, 3)
        const done = next.length >= 3 || !isModifier(part)
        if (done && next.some((p) => !isModifier(p))) {
          const accel = toAccelerator(next)
          queueMicrotask(() => {
            onChange(accel)
            stop()
          })
        } else if (done && next.every(isModifier)) {
          // Wait for a non-modifier if we somehow got 3 modifiers
        }
        return next
      })
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, onChange, stop])

  const label = recording
    ? draft.length
      ? formatDisplay(toAccelerator(draft))
      : t.hotkeyRecording
    : formatDisplay(value || t.hotkeyEmpty)

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setDraft([])
          setRecording(true)
        }}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-[12px] border px-3 text-left text-[13px] transition-colors',
          recording
            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]'
            : 'border-[var(--border)] bg-[var(--bg)] text-[var(--foreground)] hover:border-[var(--accent)]'
        )}
      >
        <span className={cn(!value && !recording && 'text-[var(--muted-foreground)]')}>
          {label}
        </span>
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {recording ? t.hotkeyMax : t.hotkeyClick}
        </span>
      </button>
      <p className="mt-1.5 text-[11px] text-[var(--muted-foreground)]">{t.hotkeyHint}</p>
    </div>
  )
}
