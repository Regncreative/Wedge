import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Dialog } from './dialog'
import { useStashStore } from '@/stores/stash-store'
import { useT } from '@/lib/i18n'

/** Edit a file's note and tags. */
export function NoteDialog() {
  const t = useT()
  const id = useStashStore((s) => s.noteFileId)
  const file = useStashStore((s) => s.files.find((f) => f.id === s.noteFileId))
  const editNote = useStashStore((s) => s.editNote)
  const refresh = useStashStore((s) => s.refresh)
  const [note, setNote] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    if (!file) return
    setNote(file.note)
    setTags(file.tags)
    // Only when a different file is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const save = async () => {
    if (!file) return
    await window.stash.setNote(file.id, note, tags)
    editNote(null)
    await refresh()
  }

  return (
    <AnimatePresence>
      {id && file && (
        <Dialog
          labelledBy="note-title"
          onClose={() => editNote(null)}
          z={82}
          onKeyDown={(e) => {
            if (e.key === 'Escape') editNote(null)
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
          }}
        >
          <h2 id="note-title" className="display-font text-[15px] font-semibold text-[var(--fg)]">
            {t.noteTitle}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-[var(--fg-3)]">{file.name}</p>
          <textarea
            // Immediate focus: a delayed focus() could steal keystrokes meant for the tags field.
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder={t.notePlaceholder}
            aria-label={t.noteTitle}
            className="field mt-3 h-auto resize-none py-2 text-[13px] leading-relaxed"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            maxLength={300}
            placeholder={t.tagsPlaceholder}
            aria-label={t.tagsPlaceholder}
            className="field mt-2 h-9 text-[13px]"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => editNote(null)}>
              {t.cancel}
            </button>
            <button type="button" className="btn-primary" onClick={() => void save()}>
              {t.save}
            </button>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
}
