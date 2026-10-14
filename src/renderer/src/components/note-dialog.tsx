import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
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
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!file) return
    setNote(file.note)
    setTags(file.tags)
    // Only when a different file is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id || !file) return null

  const save = async () => {
    await window.stash.setNote(file.id, note, tags)
    editNote(null)
    await refresh()
  }

  return (
    <div
      className="absolute inset-0 z-[82] flex items-center justify-center bg-black/45 px-6"
      onMouseDown={(e) => e.target === e.currentTarget && editNote(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') editNote(null)
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-title"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-[340px] rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--hover-shadow)]"
      >
        <h2 id="note-title" className="text-[15px] font-semibold text-[var(--foreground)]">
          {t.noteTitle}
        </h2>
        <p className="mt-0.5 truncate text-[12px] text-[var(--muted-foreground)]">{file.name}</p>
        <textarea
          ref={noteRef}
          // Immediate focus: a delayed focus() could steal keystrokes meant for the tags field.
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder={t.notePlaceholder}
          aria-label={t.noteTitle}
          className="mt-3 w-full resize-none rounded-[10px] border border-[var(--border)] bg-[var(--pill)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          maxLength={300}
          placeholder={t.tagsPlaceholder}
          aria-label={t.tagsPlaceholder}
          className="mt-2 h-9 w-full rounded-[10px] border border-[var(--border)] bg-[var(--pill)] px-3 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => editNote(null)}
            className="h-9 rounded-[10px] px-3 text-[13px] text-[var(--muted-foreground)] hover:bg-[var(--pill)]"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="h-9 rounded-[10px] bg-[var(--accent)] px-4 text-[13px] font-medium text-white hover:opacity-90"
          >
            {t.save}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
