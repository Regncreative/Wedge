import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { formatDisplay, isModifier, mapKey, toAccelerator } from '@/lib/hotkey'

interface HotkeyRecorderProps {
  value: string
  onChange: (accelerator: string) => void
  label: string
}

/** Click, then press up to three keys; Esc cancels. */
export function HotkeyRecorder({ value, onChange, label }: HotkeyRecorderProps) {
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
        }
        return next
      })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, onChange, stop])

  const keys = recording
    ? draft.length
      ? formatDisplay(toAccelerator(draft)).split('+')
      : []
    : value
      ? formatDisplay(value).split('+')
      : []

  return (
    <button
      type="button"
      aria-label={label}
      title={t.hotkeyHint}
      onClick={() => {
        setDraft([])
        setRecording(true)
      }}
      onBlur={stop}
      className={cn(
        'flex h-8 min-w-[120px] items-center justify-center gap-1 rounded-lg px-2 text-[12px] transition-colors',
        recording
          ? 'bg-[var(--accent-faint)] shadow-[inset_0_0_0_1px_var(--accent)]'
          : 'bg-[var(--field)] shadow-[inset_0_0_0_1px_var(--stroke)] hover:shadow-[inset_0_0_0_1px_var(--stroke-strong)]'
      )}
    >
      {keys.length === 0 ? (
        <span className="text-[var(--fg-3)]">{recording ? t.hotkeyRecording : t.hotkeyEmpty}</span>
      ) : (
        keys.map((k, i) => (
          <kbd
            key={`${k}-${i}`}
            className="rounded-[5px] bg-[var(--surface-pressed)] px-1.5 py-0.5 font-sans text-[11.5px] font-medium text-[var(--fg)]"
          >
            {k.trim()}
          </kbd>
        ))
      )}
    </button>
  )
}
