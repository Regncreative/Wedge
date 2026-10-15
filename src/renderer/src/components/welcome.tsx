import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ArrowDownToLine, ArrowUpRight, Keyboard, PanelRightOpen } from 'lucide-react'
import { Dialog } from './dialog'
import { StashMark } from './mark'
import { formatDisplay } from '@/lib/hotkey'
import { useStashStore } from '@/stores/stash-store'
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

  const dismiss = () => void updateSettings({ onboardingDone: true })

  return (
    <AnimatePresence>
      {visible && settings && (
        <Dialog
          labelledBy="welcome-title"
          z={85}
          className="max-w-[380px]"
          onKeyDown={(e) => e.key === 'Escape' && dismiss()}
        >
          <StashMark size={40} />
          <h2
            id="welcome-title"
            className="display-font mt-3.5 text-[19px] font-semibold text-[var(--fg)]"
          >
            {t.welcomeTitle}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--fg-2)]">
            {t.welcomeSubtitle}
          </p>
          <ul className="mt-4 space-y-3">
            <Step
              icon={<ArrowDownToLine size={16} strokeWidth={1.75} />}
              title={t.welcomeDropTitle}
            >
              {t.welcomeDropBody}
            </Step>
            <Step icon={<PanelRightOpen size={16} strokeWidth={1.75} />} title={t.welcomeEdgeTitle}>
              {t.welcomeEdgeBody}
            </Step>
            <Step icon={<ArrowUpRight size={16} strokeWidth={1.75} />} title={t.welcomeDragTitle}>
              {t.welcomeDragBody}
            </Step>
            <Step icon={<Keyboard size={16} strokeWidth={1.75} />} title={t.welcomeHotkeyTitle}>
              {t.welcomeHotkeyBody(formatDisplay(settings.openHotkey))}
            </Step>
          </ul>
          <button
            ref={startRef}
            type="button"
            onClick={dismiss}
            className="btn-primary mt-5 h-9 w-full"
          >
            {t.welcomeStart}
          </button>
        </Dialog>
      )}
    </AnimatePresence>
  )
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-faint)] text-[var(--accent-text)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-[var(--fg)]">{title}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--fg-3)]">{children}</p>
      </div>
    </li>
  )
}
