import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Cloud, FolderOpen, Lock, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dialog } from './dialog'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

function Point({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <li className="flex gap-2.5">
      <Icon size={15} strokeWidth={1.75} className="mt-px shrink-0 text-[var(--accent-text)]" />
      <span className="text-[12px] leading-snug text-[var(--fg-2)]">{children}</span>
    </li>
  )
}

/** Explains shared shelves and links a folder as one. */
export function SharedShelfDialog() {
  const t = useT()
  const open = useStashStore((s) => s.sharedDialog)
  const setOpen = useStashStore((s) => s.setSharedDialog)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  const choose = async () => {
    const folder = await window.stash.pickFolder()
    if (!folder) return
    setBusy(true)
    const { refresh, setActiveShelf, showToast } = useStashStore.getState()
    try {
      const shelf = await window.stash.createSharedShelf(folder)
      await refresh()
      setActiveShelf(shelf.id)
      setOpen(false)
      showToast(t.sharedCreated(shelf.name))
    } catch {
      showToast(t.folderUnavailable)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <Dialog
          labelledBy="shared-title"
          onClose={() => setOpen(false)}
          z={81}
          className="max-w-[380px]"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
              <Cloud size={20} strokeWidth={1.75} className="text-[var(--accent-text)]" />
            </span>
            <h2
              id="shared-title"
              className="display-font text-[16px] font-semibold text-[var(--fg)]"
            >
              {t.sharedTitle}
            </h2>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--fg)]">{t.sharedIntro}</p>
          <ul className="mt-3.5 space-y-2.5">
            <Point icon={FolderOpen}>{t.sharedHowCopy}</Point>
            <Point icon={RefreshCw}>{t.sharedHowSee}</Point>
            <Point icon={Trash2}>{t.sharedHowRemove}</Point>
            <Point icon={UserPlus}>{t.sharedHowFriend}</Point>
            <Point icon={Lock}>{t.sharedHowPrivate}</Point>
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void choose()}
            >
              <FolderOpen size={14} strokeWidth={2} />
              {t.chooseFolder}
            </button>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
}
