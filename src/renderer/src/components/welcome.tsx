import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownToLine, ArrowUpRight, Keyboard } from 'lucide-react'
import { useStashStore } from '@/stores/stash-store'
import { formatDisplay } from '@/lib/hotkey'
import { useT } from '@/lib/i18n'

/** First-run introduction; shown until dismissed once. */
export function Welcome() {
  const t = useT()
  const settings = useStashStore((s) => s.settings)
  const updateSettings = useStashStore((s) => s.updateSettings)
  const startRef = useRef<HTMLButtonElement>(null)

  const visible = settings !== null && !settings.onboardingDone

  useEffect(() => {
    if (visible) startRef.current?.focus()
  }, [visible])

  if (!visible) return null

  const dismiss = () => void updateSettings({ onboardingDone: true })

  return (
    <div
      className="absolute inset-0 z-[85] flex items-center justify-center bg-black/45 px-5"
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss()
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="w-full rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[var(--hover-shadow)]"
      >
        <h2 id="welcome-title" className="text-[17px] font-semibold text-[var(--foreground)]">
          {t.welcomeTitle}
        </h2>
        <ul className="mt-4 space-y-3.5">
          <Step icon={<ArrowDownToLine size={18} strokeWidth={1.75} />} title={t.welcomeDropTitle}>
            {t.welcomeDropBody}
          </Step>
          <Step icon={<ArrowUpRight size={18} strokeWidth={1.75} />} title={t.welcomeDragTitle}>
            {t.welcomeDragBody}
          </Step>
          <Step icon={<Keyboard size={18} strokeWidth={1.75} />} title={t.welcomeHotkeyTitle}>
            {t.welcomeHotkeyBody(formatDisplay(settings.openHotkey))}
          </Step>
        </ul>
        <button
          ref={startRef}
          type="button"
          onClick={dismiss}
          className="mt-5 h-10 w-full rounded-[12px] bg-[var(--accent)] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {t.welcomeStart}
        </button>
      </motion.div>
    </div>
  )
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[var(--foreground)]">{title}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--muted-foreground)]">{children}</p>
      </div>
    </li>
  )
}
