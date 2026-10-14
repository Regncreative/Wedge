import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, FolderSync, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { Rule, SyncDevice } from '@shared/types'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const FIELD =
  'h-9 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[12.5px] text-[var(--foreground)] outline-none focus:border-[var(--accent)]'
const BUTTON =
  'flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--pill)] px-3 text-[12.5px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pill-hover)] disabled:opacity-40'

/** Sorting rules: extensions + source → shelf. */
export function RulesEditor() {
  const t = useT()
  const shelves = useStashStore((s) => s.shelves)
  const [rules, setRules] = useState<Rule[]>([])
  const [extensions, setExtensions] = useState('')
  const [source, setSource] = useState<Rule['source']>('downloads')
  const [shelfId, setShelfId] = useState('')

  const load = useCallback(async () => setRules(await window.stash.listRules()), [])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!shelfId && shelves[0]) setShelfId(shelves[0].id)
  }, [shelves, shelfId])

  const sources: { id: Rule['source']; label: string }[] = [
    { id: 'any', label: t.ruleSourceAny },
    { id: 'manual', label: t.sourceManual },
    { id: 'downloads', label: t.sourceDownloads },
    { id: 'screenshots', label: t.sourceScreenshots },
    { id: 'phone', label: t.sourcePhone },
    { id: 'clipboard', label: t.sourceClipboard }
  ]
  const sourceLabel = (id: string) => sources.find((s) => s.id === id)?.label ?? id
  const shelfName = (id: string) => shelves.find((s) => s.id === id)?.name ?? '—'

  return (
    <div>
      {rules.length === 0 ? (
        <p className="text-[12px] text-[var(--muted-foreground)]">{t.noRules}</p>
      ) : (
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-[10px] bg-[var(--pill)] px-2.5 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-[var(--foreground)]">{r.extensions ? r.extensions.split(',').join(', ') : t.ruleAllFiles}</span>
                <span className="text-[var(--muted-foreground)]"> · {sourceLabel(r.source)}</span>
              </span>
              <ArrowRight size={13} className="shrink-0 text-[var(--muted-foreground)]" />
              <span className="max-w-[90px] truncate font-medium text-[var(--foreground)]">{shelfName(r.shelfId)}</span>
              <button
                type="button"
                className="icon-btn h-6 w-6 text-[var(--destructive)]"
                aria-label={t.delete}
                onClick={async () => {
                  await window.stash.deleteRule(r.id)
                  await load()
                }}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <input
          value={extensions}
          onChange={(e) => setExtensions(e.target.value)}
          placeholder={t.ruleExtensions}
          aria-label={t.ruleExtensions}
          className={cn(FIELD, 'col-span-2')}
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as Rule['source'])}
          aria-label={t.ruleSourceAny}
          className={FIELD}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={shelfId} onChange={(e) => setShelfId(e.target.value)} aria-label={t.shelvesSection} className={FIELD}>
          {shelves.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={cn(BUTTON, 'col-span-2')}
          disabled={!shelfId}
          onClick={async () => {
            await window.stash.addRule(shelfId, extensions, source)
            setExtensions('')
            await load()
          }}
        >
          <Plus size={14} strokeWidth={1.75} />
          {t.addRule}
        </button>
      </div>
    </div>
  )
}

/** Folder-based sync between PCs. */
export function SyncCard() {
  const t = useT()
  const folder = useStashStore((s) => s.settings?.syncFolder ?? '')
  const updateSettings = useStashStore((s) => s.updateSettings)
  const refresh = useStashStore((s) => s.refresh)
  const showToast = useStashStore((s) => s.showToast)
  const [devices, setDevices] = useState<SyncDevice[]>([])
  const [busy, setBusy] = useState(false)

  const syncNow = useCallback(async () => {
    setBusy(true)
    try {
      setDevices(await window.stash.syncNow())
      await refresh()
    } catch {
      showToast(t.syncFailed)
    } finally {
      setBusy(false)
    }
  }, [refresh, showToast, t])

  useEffect(() => {
    if (folder) void syncNow()
    else setDevices([])
    // Run when the folder changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder])

  return (
    <div>
      <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">{t.syncHint}</p>
      {folder && (
        <p className="mt-2 flex items-center gap-1.5 break-all rounded-[10px] bg-[var(--pill)] px-2.5 py-1.5 text-[12px] text-[var(--foreground)]">
          <FolderSync size={14} className="shrink-0 text-[var(--accent)]" />
          {folder}
        </p>
      )}
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          className={cn(BUTTON, 'flex-1')}
          onClick={async () => {
            const picked = await window.stash.pickFolder()
            if (picked) await updateSettings({ syncFolder: picked })
          }}
        >
          {t.syncChoose}
        </button>
        {folder && (
          <>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void syncNow()} aria-label={t.syncNow} title={t.syncNow}>
              <RefreshCw size={14} strokeWidth={1.75} className={cn(busy && 'animate-spin')} />
            </button>
            <button type="button" className={BUTTON} onClick={() => void updateSettings({ syncFolder: '' })}>
              {t.syncOff}
            </button>
          </>
        )}
      </div>
      {devices.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[12px]">
          {devices.map((d) => (
            <li key={`${d.name}-${d.updatedAt}`} className="flex justify-between gap-2 text-[var(--muted-foreground)]">
              <span className="truncate text-[var(--foreground)]">
                {d.name}
                {d.thisPc ? ` (${t.syncThisPc})` : ''}
              </span>
              <span className="tabular-nums">{new Date(d.updatedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
