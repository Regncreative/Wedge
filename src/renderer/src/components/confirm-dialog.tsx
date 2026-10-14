import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Dialog } from './dialog'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

/** Confirmation and one-line prompt, driven by `askConfirm` / `askPrompt`. */
export function ConfirmDialog() {
  const t = useT()
  const confirm = useStashStore((s) => s.confirm)
  const resolveConfirm = useStashStore((s) => s.resolveConfirm)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isPrompt = confirm?.promptDefault !== undefined || confirm?.promptPlaceholder !== undefined

  useEffect(() => {
    if (!confirm) return
    setValue(confirm.promptDefault ?? '')
    if (isPrompt) {
      const timer = window.setTimeout(() => inputRef.current?.select(), 30)
      return () => window.clearTimeout(timer)
    }
  }, [confirm, isPrompt])

  useEffect(() => {
    if (!confirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        resolveConfirm(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirm, resolveConfirm])

  const submit = () => resolveConfirm(isPrompt ? value.trim() || null : true)

  return (
    <AnimatePresence>
      {confirm && (
        <Dialog labelledBy="stash-confirm-title" onClose={() => resolveConfirm(null)}>
          <h2
            id="stash-confirm-title"
            className="display-font text-[15px] font-semibold text-[var(--fg)]"
          >
            {confirm.title}
          </h2>
          {confirm.message && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--fg-2)]">
              {confirm.message}
            </p>
          )}
          {isPrompt && (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              maxLength={100}
              placeholder={confirm.promptPlaceholder}
              aria-label={confirm.promptPlaceholder ?? confirm.title}
              className="field mt-3 h-9 text-[13px]"
            />
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => resolveConfirm(null)}>
              {confirm.cancelLabel ?? t.cancel}
            </button>
            <button
              type="button"
              autoFocus={!isPrompt}
              className={confirm.danger ? 'btn-danger' : 'btn-primary'}
              onClick={submit}
            >
              {confirm.confirmLabel ?? t.confirm}
            </button>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
}
