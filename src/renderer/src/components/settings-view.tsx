import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Plus, Power, RefreshCw, Trash2, X } from 'lucide-react'
import type { EdgeAlign, FileSort, MonitorInfo, Rule, ThemeMode, UpdateStatus } from '@shared/types'
import { HotkeyRecorder } from './hotkey-recorder'
import { ShelfIcon } from './file-icon'
import { useStashStore } from '@/stores/stash-store'
import { useEdge } from '@/lib/edge'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

const ACCENTS = [
  '#8D97FF',
  '#43D8AA',
  '#FF7FAC',
  '#F6BB45',
  '#5CC8FF',
  '#FF8A65',
  '#B5E655',
  '#C79BFF'
]

type Tab = 'look' | 'use' | 'auto' | 'more'
type Side = 'left' | 'right'

// The tab stays put while the drawer closes and opens again.
let lastTab: Tab = 'look'

// The side the tabs come back to when they're switched on again.
const SIDE_KEY = 'wedge.edgeSide'
function rememberedSide(): Side {
  try {
    return localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}
function rememberSide(side: Side) {
  try {
    localStorage.setItem(SIDE_KEY, side)
  } catch {
    // Not kept: the tabs come back on the right.
  }
}

function Section({
  title,
  hint,
  children
}: {
  title?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="mb-4">
      {title && (
        <h2 className="mb-1.5 px-1 text-[12px] font-semibold text-[var(--fg-2)]">{title}</h2>
      )}
      {hint && (
        <p className="-mt-0.5 mb-2 px-1 text-[11.5px] leading-snug text-[var(--fg-3)]">{hint}</p>
      )}
      <div className="card divide-y divide-[var(--stroke)] overflow-hidden">{children}</div>
    </section>
  )
}

/** A setting: label and hint, its control on the right (or below them when `stacked`). */
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
    <div className={cn('px-3.5 py-2.5', stacked ? 'space-y-2' : 'flex items-center gap-3')}>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-[var(--fg)]">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--fg-3)]">{hint}</div>}
      </div>
      {children && <div className="flex shrink-0 gap-1.5">{children}</div>}
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
        // px, not rem: the knob moves in px, and the panel's rem isn't 16px.
        'relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors duration-150',
        checked ? 'bg-[var(--accent)]' : 'bg-transparent shadow-[inset_0_0_0_1px_var(--fg-3)]'
      )}
    >
      <motion.span
        className={cn(
          'absolute top-[4px] h-[12px] w-[12px] rounded-full',
          checked ? 'bg-white' : 'bg-[var(--fg-2)]'
        )}
        animate={{ left: checked ? 20 : 4, scale: 1 }}
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

const SPOT_TOP: Record<EdgeAlign, string> = { top: '18%', center: '50%', bottom: '82%' }

/**
 * A small screen with the six places the tabs can sit: either edge, at the
 * top, middle or bottom. Picking one while the tabs are off turns them on.
 */
function PlacementPicker({
  side,
  align,
  on,
  onPick
}: {
  side: Side
  align: EdgeAlign
  on: boolean
  onPick: (side: Side, align: EdgeAlign) => void
}) {
  const t = useT()
  const shelves = useStashStore((s) => s.shelves)
  const colors = shelves.slice(0, 4).map((s) => s.color)
  const sideLabel = { left: t.edgeLeft, right: t.edgeRight }
  const alignLabel = { top: t.alignTop, center: t.alignCenter, bottom: t.alignBottom }
  return (
    <div className="px-3.5 py-3">
      <div
        className={cn(
          'relative mx-auto h-[96px] w-[172px] rounded-[9px] bg-[var(--field)] shadow-[inset_0_0_0_1.5px_var(--stroke-strong)] transition-opacity',
          !on && 'opacity-50'
        )}
      >
        {/* The taskbar, so the screen reads as a screen. */}
        <div className="absolute inset-x-[1.5px] bottom-[1.5px] h-[9px] rounded-b-[7.5px] bg-[var(--surface-pressed)]" />
        {(['left', 'right'] as const).map((s) =>
          (['top', 'center', 'bottom'] as const).map((a) => {
            const chosen = on && s === side && a === align
            return (
              <button
                key={s + a}
                type="button"
                aria-label={`${sideLabel[s]} · ${alignLabel[a]}`}
                aria-pressed={chosen}
                title={`${sideLabel[s]} · ${alignLabel[a]}`}
                onClick={() => onPick(s, a)}
                className={cn(
                  'group absolute flex h-[30px] w-[22px] -translate-y-1/2 items-center',
                  s === 'left' ? 'left-0 justify-start' : 'right-0 justify-end'
                )}
                style={{ top: SPOT_TOP[a] }}
              >
                {chosen ? (
                  <span className="flex flex-col gap-[2px]">
                    {colors.map((c, i) => (
                      <span
                        key={i}
                        className={cn(
                          'block h-[5px] w-[11px]',
                          s === 'left' ? 'rounded-r-[2px]' : 'rounded-l-[2px]'
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'mx-[4px] block h-[16px] w-[6px] rounded-full border border-dashed border-[var(--fg-3)] transition-colors',
                      'group-hover:border-solid group-hover:border-[var(--accent)] group-hover:bg-[var(--accent)]'
                    )}
                  />
                )}
              </button>
            )
          })
        )}
      </div>
      <p className="mt-2 text-center text-[11.5px] text-[var(--fg-3)]" aria-live="polite">
        {on ? `${sideLabel[side]} · ${alignLabel[align]}` : ' '}
      </p>
    </div>
  )
}

/** Sorting rules: extensions + source → shelf. The form opens on "Add rule". */
function RulesEditor() {
  const t = useT()
  const shelves = useStashStore((s) => s.shelves)
  const [rules, setRules] = useState<Rule[]>([])
  const [adding, setAdding] = useState(false)
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
        !adding && <p className="mb-2.5 text-[12px] text-[var(--fg-3)]">{t.noRules}</p>
      ) : (
        <ul className="mb-2.5 space-y-1">
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
      {adding ? (
        <form
          className="grid grid-cols-2 gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!shelfId) return
            await window.stash.addRule(shelfId, extensions, source)
            setExtensions('')
            setAdding(false)
            await load()
          }}
        >
          <input
            autoFocus
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
          <button type="button" className="btn" onClick={() => setAdding(false)}>
            {t.cancel}
          </button>
          <button type="submit" className="btn-primary">
            {t.addRule}
          </button>
        </form>
      ) : (
        <button type="button" className="btn w-full" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={1.75} />
          {t.addRule}
        </button>
      )}
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
  const [tab, setTab] = useState<Tab>(lastTab)
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const [clearing, setClearing] = useState(false)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])

  useEffect(() => {
    void window.stash.listMonitors().then(setMonitors)
  }, [])

  useEffect(() => {
    void window.stash.getUpdateStatus().then(setUpdate)
    return window.stash.onUpdateStatus(setUpdate)
  }, [])

  if (!settings) return null

  const pickTab = (next: Tab) => {
    lastTab = next
    setTab(next)
  }

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

  const edgeOn = settings.edgeHandle !== 'off'
  const side: Side = settings.edgeHandle === 'off' ? rememberedSide() : settings.edgeHandle
  const store = update.state === 'store'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'look', label: t.settingsLook },
    { id: 'use', label: t.settingsUse },
    { id: 'auto', label: t.settingsAuto },
    { id: 'more', label: t.settingsMore }
  ]

  const look = (
    <>
      <Section>
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
          <div className="flex-1 text-[12.5px] font-medium text-[var(--fg)]">{t.accentColor}</div>
          <div className="flex gap-1.5">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${t.accentColor} ${c}`}
                aria-pressed={settings.accentColor.toLowerCase() === c.toLowerCase()}
                onClick={() => void updateSettings({ accentColor: c })}
                className={cn(
                  'h-5 w-5 rounded-full transition-transform duration-100 hover:scale-110',
                  settings.accentColor.toLowerCase() === c.toLowerCase() &&
                    'ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-[var(--bg-solid)]'
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </Section>
      <Section title={t.edgeHandle}>
        <PlacementPicker
          side={side}
          align={settings.edgeAlign}
          on={edgeOn}
          onPick={(s, a) => {
            rememberSide(s)
            void updateSettings({ edgeHandle: s, edgeAlign: a })
          }}
        />
        {monitors.length > 1 && (
          <Row label={t.edgeMonitor}>
            <select
              className="field w-[170px]"
              aria-label={t.edgeMonitor}
              value={settings.edgeMonitor}
              onChange={(e) => void updateSettings({ edgeMonitor: e.target.value })}
            >
              <option value="primary">{t.monitorPrimary}</option>
              <option value="cursor">{t.monitorCursor}</option>
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {t.monitorName(m.number, m.width, m.height, m.primary)}
                </option>
              ))}
              {/* Chosen but unplugged: the shelves are on the main display until it's back. */}
              {settings.edgeMonitor !== 'primary' &&
                settings.edgeMonitor !== 'cursor' &&
                !monitors.some((m) => m.id === settings.edgeMonitor) && (
                  <option value={settings.edgeMonitor}>{t.monitorGone}</option>
                )}
            </select>
          </Row>
        )}
        {edgeOn && (
          <Row label={t.edgeAutoHide} hint={t.edgeAutoHideHint}>
            <Switch
              label={t.edgeAutoHide}
              checked={settings.edgeAutoHide}
              onChange={(v) => void updateSettings({ edgeAutoHide: v })}
            />
          </Row>
        )}
        <Row label={t.edgeTabs} hint={t.edgeTabsHint}>
          <Switch
            label={t.edgeTabs}
            checked={edgeOn}
            onChange={(v) => {
              if (!v && settings.edgeHandle !== 'off') rememberSide(settings.edgeHandle)
              void updateSettings({ edgeHandle: v ? rememberedSide() : 'off' })
            }}
          />
        </Row>
      </Section>
    </>
  )

  const use = (
    <>
      <Section>
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
            {(
              [
                ['added', t.sortAdded],
                ['name', t.sortName],
                ['recent', t.sortRecent],
                ['size', t.sortSize]
              ] as const
            ).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title={t.windowsSection}>
        <Row label={t.startWithWindows}>
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
        <Row label={t.contextMenuToggle} hint={store ? undefined : t.contextMenuHint}>
          <Switch
            label={t.contextMenuToggle}
            checked={settings.contextMenu}
            onChange={(v) => void updateSettings({ contextMenu: v })}
          />
        </Row>
      </Section>
    </>
  )

  const auto = (
    <>
      <Section>
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
      <Section title={t.rulesSection} hint={t.rulesHint}>
        <RulesEditor />
      </Section>
    </>
  )

  const more = (
    <>
      <Section title={t.updatesSection}>
        <Row label={t.currentVersion(appVersion || '—')} hint={updateHint(t, update)}>
          {store ? null : update.state === 'downloaded' ? (
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
        {!store && (
          <Row label={t.betaUpdates} hint={t.betaUpdatesHint}>
            <Switch
              label={t.betaUpdates}
              checked={settings.updateChannel === 'beta'}
              onChange={(v) => void updateSettings({ updateChannel: v ? 'beta' : 'stable' })}
            />
          </Row>
        )}
        {update.state === 'error' && (
          <Row label={t.updateError} hint={t.updateErrorHint}>
            <button type="button" className="btn" onClick={() => void window.stash.openReleases()}>
              {t.downloadManually}
            </button>
          </Row>
        )}
      </Section>
      <Section title={t.maintenanceSection}>
        <Row label={t.backup} hint={t.dataHint} stacked>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const res = await useStashStore.getState().hold(() => window.stash.exportData())
              if (res.ok) showToast(t.exportDone)
            }}
          >
            {t.exportData}
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const res = await useStashStore.getState().hold(() => window.stash.importData())
              if (res.ok) {
                await refresh()
                showToast(t.importDone(res.shelves, res.files))
              } else if (!res.canceled) showToast(t.importFailed)
            }}
          >
            {t.importData}
          </button>
        </Row>
        <Row label={t.missingFiles} hint={t.clearMissingHint}>
          <button
            type="button"
            className="btn"
            disabled={clearing}
            onClick={() => void clearMissing()}
          >
            {t.cleanUp}
          </button>
        </Row>
        <Row label={t.logsFolder} hint={t.openLogsHint}>
          <button type="button" className="btn" onClick={() => void window.stash.openLogsFolder()}>
            {t.open}
          </button>
        </Row>
      </Section>
      <button type="button" className="btn mb-3 w-full" onClick={() => void window.stash.quit()}>
        <Power size={14} strokeWidth={1.75} />
        {t.quitApp}
      </button>
      <p className="pb-2 pt-1 text-center text-[11px] text-[var(--fg-3)]">
        Wedge {appVersion ? `v${appVersion}` : ''} · Regncreative
      </p>
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-1.5 px-4 pb-2.5 pt-4">
        <button
          type="button"
          className="btn-icon"
          aria-label={t.back}
          title={t.back}
          onClick={() => setShowSettings(false)}
        >
          <ArrowLeft size={17} strokeWidth={1.75} />
        </button>
        <h1 className="display-font flex-1 text-[22px] font-extrabold tracking-[-0.02em] text-[var(--fg)]">
          {t.settings}
        </h1>
        <button
          type="button"
          className="btn-icon"
          aria-label={t.close}
          title={t.close}
          onClick={() => useEdge.getState().request('idle')}
        >
          <X size={17} strokeWidth={1.75} />
        </button>
      </header>

      <div role="tablist" aria-label={t.settings} className="segmented mx-3 mb-3 flex shrink-0">
        {tabs.map((x) => (
          <button
            key={x.id}
            id={`settings-tab-${x.id}`}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            aria-controls="settings-panel"
            className="min-w-0 flex-1 truncate"
            onClick={() => pickTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
        className="scroll-autohide min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      >
        {tab === 'look' ? look : tab === 'use' ? use : tab === 'auto' ? auto : more}
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
    case 'store':
      return t.updateStore
    case 'error':
      return t.updateError
    default:
      return undefined
  }
}
