import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Download,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Users,
  X
} from 'lucide-react'
import type { FileSort, Rule, ThemeMode, UpdateStatus } from '@shared/types'
import { HotkeyRecorder } from './hotkey-recorder'
import { ShelfIcon } from './file-icon'
import { useStashStore } from '@/stores/stash-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const ACCENTS = [
  '#2563EB',
  '#0078D4',
  '#7C3AED',
  '#0F9D58',
  '#038387',
  '#D97706',
  '#E11D48',
  '#C239B3'
]

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 px-1 text-[12px] font-semibold text-[var(--fg-2)]">{title}</h2>
      {hint && (
        <p className="-mt-0.5 mb-2 px-1 text-[11.5px] leading-snug text-[var(--fg-3)]">{hint}</p>
      )}
      <div className="card divide-y divide-[var(--stroke)] overflow-hidden">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children,
  stacked
}: {
  label: string
  hint?: string
  children?: ReactNode
  stacked?: boolean
}) {
  return (
    <div className={cn('px-3.5 py-3', stacked ? 'space-y-2.5' : 'flex items-center gap-3')}>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-[var(--fg)]">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--fg-3)]">{hint}</div>}
      </div>
      {children && <div className={cn(!stacked && 'shrink-0')}>{children}</div>}
    </div>
  )
}

function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-10 shrink-0 rounded-full transition-colors duration-150',
        checked ? 'bg-[var(--accent)]' : 'bg-transparent shadow-[inset_0_0_0_1px_var(--fg-3)]'
      )}
    >
      <motion.span
        className={cn(
          'absolute top-[4px] h-3 w-3 rounded-full',
          checked ? 'bg-white' : 'bg-[var(--fg-2)]'
        )}
        animate={{ left: checked ? 24 : 4, scale: 1 }}
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
      />
    </button>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Slider({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  onRelease
}: {
  value: number
  min: number
  max: number
  step: number
  label: string
  format: (v: number) => string
  onChange: (v: number) => void
  onRelease?: (v: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onRelease?.(Number((e.target as HTMLInputElement).value))}
        className="stash-range w-[150px]"
        style={{ ['--fill' as string]: `${fill}%` }}
      />
      <span className="w-10 text-right text-[12px] tabular-nums text-[var(--fg-2)]">
        {format(value)}
      </span>
    </div>
  )
}

/** Sorting rules: extensions + source → shelf. */
function RulesEditor() {
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
  const shelfOf = (id: string) => shelves.find((s) => s.id === id)

  return (
    <div className="px-3.5 py-3">
      {rules.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-3)]">{t.noRules}</p>
      ) : (
        <ul className="space-y-1">
          {rules.map((r) => {
            const shelf = shelfOf(r.shelfId)
            return (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg bg-[var(--field)] py-1 pl-2.5 pr-1 text-[12px]"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-[var(--fg)]">
                    {r.extensions ? r.extensions.split(',').join(', ') : t.ruleAllFiles}
                  </span>
                  <span className="text-[var(--fg-3)]"> · {sourceLabel(r.source)}</span>
                </span>
                <ArrowRight size={12} className="shrink-0 text-[var(--fg-3)]" />
                {shelf && <ShelfIcon name={shelf.icon} color={shelf.color} size={13} />}
                <span className="max-w-[80px] truncate font-medium text-[var(--fg)]">
                  {shelf?.name ?? '—'}
                </span>
                <button
                  type="button"
                  className="btn-icon h-6 w-6 hover:text-[var(--danger)]"
                  aria-label={t.delete}
                  onClick={async () => {
                    await window.stash.deleteRule(r.id)
                    await load()
                  }}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <input
          value={extensions}
          onChange={(e) => setExtensions(e.target.value)}
          placeholder={t.ruleExtensions}
          aria-label={t.ruleExtensions}
          className="field col-span-2"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as Rule['source'])}
          aria-label={t.ruleSource}
          className="field"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={shelfId}
          onChange={(e) => setShelfId(e.target.value)}
          aria-label={t.ruleShelf}
          className="field"
        >
          {shelves.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn col-span-2"
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

function SharedShelves() {
  const t = useT()
  const all = useStashStore((s) => s.shelves)
  const shelves = useMemo(() => all.filter((x) => x.folder), [all])
  const setSharedDialog = useStashStore((s) => s.setSharedDialog)
  const showToast = useStashStore((s) => s.showToast)
  return (
    <div className="px-3.5 py-3">
      {shelves.length === 0 ? (
        <p className="text-[12px] text-[var(--fg-3)]">{t.noSharedShelves}</p>
      ) : (
        <ul className="space-y-1">
          {shelves.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2.5 rounded-lg bg-[var(--field)] py-1.5 pl-2.5 pr-1"
            >
              <Users size={14} strokeWidth={1.75} className="shrink-0 text-[var(--accent-text)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-[var(--fg)]">{s.name}</div>
                <div className="truncate text-[11px] text-[var(--fg-3)]" title={s.folder ?? ''}>
                  {s.folder}
                </div>
              </div>
              <button
                type="button"
                className="btn-icon h-7 w-7"
                aria-label={t.openFolder}
                title={t.openFolder}
                onClick={async () => {
                  const res = await window.stash.openShelfFolder(s.id)
                  if (!res.ok) showToast(t.folderUnavailable)
                }}
              >
                <FolderOpen size={14} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn mt-2.5 w-full" onClick={() => setSharedDialog(true)}>
        <Plus size={14} strokeWidth={1.75} />
        {t.newSharedShelf}
      </button>
    </div>
  )
}

export function SettingsView() {
  const t = useT()
  const settings = useStashStore((s) => s.settings)
  const updateSettings = useStashStore((s) => s.updateSettings)
  const setShowSettings = useStashStore((s) => s.setShowSettings)
  const shelves = useStashStore((s) => s.shelves)
  const refresh = useStashStore((s) => s.refresh)
  const showToast = useStashStore((s) => s.showToast)
  const askConfirm = useStashStore((s) => s.askConfirm)
  const appVersion = useStashStore((s) => s.appVersion)
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    void window.stash.getUpdateStatus().then(setUpdate)
    return window.stash.onUpdateStatus(setUpdate)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useStashStore.getState().confirm) setShowSettings(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setShowSettings])

  if (!settings) return null

  const clearMissing = async () => {
    if (clearing) return
    setClearing(true)
    try {
      await refresh()
      const missing = useStashStore.getState().files.filter((f) => !f.exists).length
      if (missing > 0) {
        const ok = await askConfirm({
          title: t.clearMissing,
          message: t.clearMissingConfirm(missing),
          confirmLabel: t.remove,
          danger: true
        })
        if (!ok) return
      }
      const removed = await window.stash.clearMissingFiles()
      await refresh()
      showToast(removed === 0 ? t.clearMissingNone : t.clearMissingDone(removed))
    } finally {
      setClearing(false)
    }
  }

  const idlePercent = Math.round(settings.idleOpacity * 100)
  const sortOptions: { id: FileSort; label: string }[] = [
    { id: 'added', label: t.sortAdded },
    { id: 'name', label: t.sortName },
    { id: 'recent', label: t.sortRecent },
    { id: 'size', label: t.sortSize }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-2 pl-4 pr-2.5">
        <h1 className="display-font flex-1 text-[15.5px] font-semibold text-[var(--fg)]">
          {t.settings}
        </h1>
        <button
          type="button"
          className="btn-icon"
          aria-label={t.close}
          title={t.close}
          onClick={() => setShowSettings(false)}
        >
          <X size={17} strokeWidth={1.75} />
        </button>
      </header>

      <div className="scroll-autohide min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <Section title={t.generalSection}>
          <Row label={t.theme}>
            <Segmented<ThemeMode>
              value={settings.theme}
              onChange={(v) => void updateSettings({ theme: v })}
              options={[
                { id: 'system', label: t.themeSystem },
                { id: 'light', label: t.themeLight },
                { id: 'dark', label: t.themeDark }
              ]}
            />
          </Row>
          <Row label={t.accentColor} stacked>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`${t.accentColor} ${c}`}
                  aria-pressed={settings.accentColor.toLowerCase() === c.toLowerCase()}
                  onClick={() => void updateSettings({ accentColor: c })}
                  className={cn(
                    'h-6 w-6 rounded-full transition-transform duration-100 hover:scale-110',
                    settings.accentColor.toLowerCase() === c.toLowerCase() &&
                      'ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-[var(--bg-solid)]'
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Row>
          <Row label={t.openHotkey} hint={t.hotkeyHint}>
            <HotkeyRecorder
              label={t.openHotkey}
              value={settings.openHotkey}
              onChange={async (accel) => {
                if (!(await updateSettings({ openHotkey: accel }))) showToast(t.hotkeyUnavailable)
              }}
            />
          </Row>
          <Row label={t.defaultShelf} hint={t.defaultShelfHint}>
            <select
              className="field w-[130px]"
              aria-label={t.defaultShelf}
              value={settings.defaultShelfId}
              onChange={(e) => void updateSettings({ defaultShelfId: e.target.value })}
            >
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t.fileSort}>
            <select
              className="field w-[130px]"
              aria-label={t.fileSort}
              value={settings.fileSort}
              onChange={(e) => void updateSettings({ fileSort: e.target.value as FileSort })}
            >
              {sortOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t.startWithWindows} hint={t.startWithWindowsHint}>
            <Switch
              label={t.startWithWindows}
              checked={settings.startWithWindows}
              onChange={(v) => void updateSettings({ startWithWindows: v })}
            />
          </Row>
          <Row label={t.notifications} hint={t.notificationsHint}>
            <Switch
              label={t.notifications}
              checked={settings.notifications}
              onChange={(v) => void updateSettings({ notifications: v })}
            />
          </Row>
          <Row label={t.idleOpacity} hint={t.idleOpacityHint}>
            <Slider
              label={t.idleOpacity}
              value={idlePercent}
              min={10}
              max={70}
              step={5}
              format={(v) => `${v}%`}
              onChange={(v) => void updateSettings({ idleOpacity: v / 100 })}
              onRelease={(v) => {
                void window.stash.setOpacity(v / 100)
                window.setTimeout(() => void window.stash.setOpacity(1), 700)
              }}
            />
          </Row>
          <Row label={t.idleTimeout} hint={t.idleTimeoutHint}>
            <Slider
              label={t.idleTimeout}
              value={settings.idleTimeoutSec}
              min={5}
              max={60}
              step={5}
              format={(v) => `${v} s`}
              onChange={(v) => void updateSettings({ idleTimeoutSec: v })}
            />
          </Row>
        </Section>

        <Section title={t.captureSection}>
          <Row label={t.edgeHandle} hint={t.edgeHandleHint} stacked>
            <Segmented
              value={settings.edgeHandle}
              onChange={(v) => void updateSettings({ edgeHandle: v })}
              options={[
                { id: 'off', label: t.edgeOff },
                { id: 'left', label: t.edgeLeft },
                { id: 'right', label: t.edgeRight }
              ]}
            />
          </Row>
          <Row label={t.contextMenuToggle} hint={t.contextMenuHint}>
            <Switch
              label={t.contextMenuToggle}
              checked={settings.contextMenu}
              onChange={(v) => void updateSettings({ contextMenu: v })}
            />
          </Row>
          <Row label={t.watchDownloads} hint={t.watchDownloadsHint}>
            <Switch
              label={t.watchDownloads}
              checked={settings.watchDownloads}
              onChange={(v) => void updateSettings({ watchDownloads: v })}
            />
          </Row>
          <Row label={t.watchScreenshots} hint={t.watchScreenshotsHint}>
            <Switch
              label={t.watchScreenshots}
              checked={settings.watchScreenshots}
              onChange={(v) => void updateSettings({ watchScreenshots: v })}
            />
          </Row>
        </Section>

        <Section title={t.sharedSection} hint={t.sharedSectionHint}>
          <SharedShelves />
        </Section>

        <Section title={t.rulesSection} hint={t.rulesHint}>
          <RulesEditor />
        </Section>

        <Section title={t.maintenanceSection}>
          <Row label={t.clearMissing} hint={t.clearMissingHint}>
            <button
              type="button"
              className="btn"
              disabled={clearing}
              onClick={() => void clearMissing()}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </Row>
          <Row label={`${t.exportData} / ${t.importData}`} hint={t.dataHint}>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="btn"
                aria-label={t.exportData}
                title={t.exportData}
                onClick={async () => {
                  const res = await window.stash.exportData()
                  if (res.ok) showToast(t.exportDone)
                }}
              >
                <Upload size={14} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="btn"
                aria-label={t.importData}
                title={t.importData}
                onClick={async () => {
                  const res = await window.stash.importData()
                  if (res.ok) {
                    await refresh()
                    showToast(t.importDone(res.shelves, res.files))
                  } else if (!res.canceled) showToast(t.importFailed)
                }}
              >
                <Download size={14} strokeWidth={1.75} />
              </button>
            </div>
          </Row>
          <Row label={t.openLogs} hint={t.openLogsHint}>
            <button
              type="button"
              className="btn"
              aria-label={t.openLogs}
              onClick={() => void window.stash.openLogsFolder()}
            >
              <FileText size={14} strokeWidth={1.75} />
            </button>
          </Row>
        </Section>

        <Section title={t.updatesSection}>
          <Row label={t.currentVersion(appVersion || '—')} hint={updateHint(t, update)}>
            {update.state === 'downloaded' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void window.stash.installUpdate()}
              >
                {t.installAndRestart}
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={update.state === 'checking' || update.state === 'downloading'}
                onClick={() => void window.stash.checkForUpdates()}
              >
                <RefreshCw
                  size={14}
                  strokeWidth={1.75}
                  className={cn(update.state === 'checking' && 'animate-spin')}
                />
                {t.checkUpdates}
              </button>
            )}
          </Row>
          <Row label={t.betaUpdates} hint={t.betaUpdatesHint}>
            <Switch
              label={t.betaUpdates}
              checked={settings.updateChannel === 'beta'}
              onChange={(v) => void updateSettings({ updateChannel: v ? 'beta' : 'stable' })}
            />
          </Row>
          {update.state === 'error' && (
            <Row label={t.updateError} hint={t.updateErrorHint}>
              <button
                type="button"
                className="btn"
                onClick={() => void window.stash.openReleases()}
              >
                {t.downloadManually}
              </button>
            </Row>
          )}
        </Section>

        <p className="pb-2 pt-1 text-center text-[11px] text-[var(--fg-3)]">
          Stash {appVersion ? `v${appVersion}` : ''} · Regncreative
        </p>
      </div>
    </div>
  )
}

function updateHint(t: ReturnType<typeof useT>, s: UpdateStatus): string | undefined {
  switch (s.state) {
    case 'checking':
      return t.updateChecking
    case 'available':
      return t.updateAvailable(s.version)
    case 'downloading':
      return t.updateDownloading(s.percent)
    case 'downloaded':
      return t.updateReady(s.version)
    case 'not-available':
      return t.updateLatest
    case 'dev':
      return t.updateDev
    case 'error':
      return t.updateError
    default:
      return undefined
  }
}
