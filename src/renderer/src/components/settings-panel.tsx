import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { ArrowLeft, Download, FileText, Trash2, Upload } from 'lucide-react'
import { useStashStore } from '@/stores/stash-store'
import type { FileSort, ThemeMode } from '@shared/types'
import type { UpdateStatus } from '@shared/types'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { HotkeyRecorder } from './hotkey-recorder'
import { RulesEditor, SyncCard } from './settings-extra'

const SECONDARY_BUTTON =
  'flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--pill)] text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pill-hover)]'

const ACCENTS = ['#2563EB', '#0078D4', '#8764B8', '#038387', '#00B294', '#CA5010', '#E74856', '#C239B3']

export function SettingsPanel() {
  const t = useT()
  const settings = useStashStore((s) => s.settings)
  const updateSettings = useStashStore((s) => s.updateSettings)
  const setShowSettings = useStashStore((s) => s.setShowSettings)
  const shelves = useStashStore((s) => s.shelves)
  const refresh = useStashStore((s) => s.refresh)
  const showToast = useStashStore((s) => s.showToast)
  const askConfirm = useStashStore((s) => s.askConfirm)
  const appVersion = useStashStore((s) => s.appVersion)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    void window.stash.getUpdateStatus().then(setUpdateStatus)
    return window.stash.onUpdateStatus(setUpdateStatus)
  }, [])

  // Refresh so missing-file flags are current before clear/list actions.
  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!settings) return null

  const themeLabels: Record<ThemeMode, string> = {
    system: t.themeSystem,
    light: t.themeLight,
    dark: t.themeDark
  }

  const sortOptions: { id: FileSort; label: string }[] = [
    { id: 'added', label: t.sortAdded },
    { id: 'name', label: t.sortName },
    { id: 'recent', label: t.sortRecent },
    { id: 'size', label: t.sortSize }
  ]

  const idleTimeoutSec = settings.idleTimeoutSec ?? 10
  const idlePercent = Math.round((settings.idleOpacity ?? 0.4) * 100)

  const exportData = async () => {
    const result = await window.stash.exportData()
    if (result.ok) showToast(t.exportDone)
  }

  const importData = async () => {
    const result = await window.stash.importData()
    if (result.ok) {
      await refresh()
      showToast(t.importDone(result.shelves, result.files))
    } else if (!result.canceled) {
      showToast(t.importFailed)
    }
  }

  const clearMissing = async () => {
    if (clearing) return
    setClearing(true)
    try {
      await refresh()
      const missing = useStashStore.getState().files.filter((f) => !f.exists)
      if (missing.length === 0) {
        // Re-check on main in case the renderer list was stale.
        const removed = await window.stash.clearMissingFiles()
        await refresh()
        showToast(removed === 0 ? t.clearMissingNone : t.clearMissingDone(removed))
        return
      }
      const ok = await askConfirm({
        title: t.clearMissing,
        message: t.clearMissingConfirm(missing.length),
        confirmLabel: t.remove,
        danger: true
      })
      if (!ok) return
      const removed = await window.stash.clearMissingFiles()
      await refresh()
      showToast(removed === 0 ? t.clearMissingNone : t.clearMissingDone(removed))
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2.5 px-5 pb-3 pt-1">
        <button
          type="button"
          className="icon-btn"
          aria-label={t.back}
          onClick={() => setShowSettings(false)}
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>
        <div>
          <h2 className="text-[16px] font-semibold leading-tight text-[var(--foreground)]">
            {t.settings}
          </h2>
          <p className="text-[11px] text-[var(--muted-foreground)]">{t.settingsSubtitle}</p>
        </div>
      </div>

      <div className="scroll-autohide min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-5 pb-5">
        <SettingsCard title={t.appearance}>
          <Field label={t.theme}>
            <div className="grid grid-cols-3 gap-1.5">
              {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void updateSettings({ theme: mode })}
                  className={cn(
                    'rounded-[10px] py-2 text-[12px] font-medium transition-colors duration-150',
                    settings.theme === mode
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--pill)] text-[var(--muted-foreground)] hover:bg-[var(--pill-hover)] hover:text-[var(--foreground)]'
                  )}
                >
                  {themeLabels[mode]}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t.accentColor}>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`${t.accentColor} ${c}`}
                  onClick={() => void updateSettings({ accentColor: c })}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform duration-150 hover:scale-110',
                    settings.accentColor.toLowerCase() === c.toLowerCase() &&
                      'outline outline-2 outline-offset-2 outline-[var(--foreground)]'
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
        </SettingsCard>

        <SettingsCard title={t.behavior}>
          <ToggleRow
            label={t.startWithWindows}
            hint={t.startWithWindowsHint}
            checked={settings.startWithWindows}
            onChange={(v) => void updateSettings({ startWithWindows: v })}
          />
          <ToggleRow
            label={t.notifications}
            hint={t.notificationsHint}
            checked={settings.notifications}
            onChange={(v) => void updateSettings({ notifications: v })}
          />

          <Field label={`${t.idleOpacity} · %${idlePercent}`}>
            <input
              type="range"
              min={10}
              max={70}
              step={5}
              value={idlePercent}
              onChange={(e) => {
                const pct = Number(e.target.value)
                void updateSettings({ idleOpacity: pct / 100 })
              }}
              onPointerUp={(e) => {
                const pct = Number((e.target as HTMLInputElement).value)
                const opacity = pct / 100
                void window.stash.setOpacity(opacity)
                window.setTimeout(() => void window.stash.setOpacity(1), 700)
              }}
              className="stash-range"
              aria-valuemin={10}
              aria-valuemax={70}
              aria-valuenow={idlePercent}
              aria-label={t.idleOpacity}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
              {t.idleOpacityHint}
            </p>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[var(--muted-foreground)]">
              <span>10%</span>
              <span>70%</span>
            </div>
          </Field>

          <Field label={`${t.idleTimeout} · ${idleTimeoutSec}s`}>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={idleTimeoutSec}
              onChange={(e) => {
                void updateSettings({ idleTimeoutSec: Number(e.target.value) })
              }}
              className="stash-range"
              aria-valuemin={5}
              aria-valuemax={60}
              aria-valuenow={idleTimeoutSec}
              aria-label={t.idleTimeout}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
              {t.idleTimeoutHint}
            </p>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[var(--muted-foreground)]">
              <span>5s</span>
              <span>60s</span>
            </div>
          </Field>

          <Field label={t.fileSort}>
            <div className="grid grid-cols-2 gap-1.5">
              {sortOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => void updateSettings({ fileSort: opt.id })}
                  className={cn(
                    'rounded-[10px] py-2 text-[12px] font-medium transition-colors duration-150',
                    settings.fileSort === opt.id
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--pill)] text-[var(--muted-foreground)] hover:bg-[var(--pill-hover)] hover:text-[var(--foreground)]'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t.defaultShelf}>
            <select
              className="h-10 w-full rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-3 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              value={settings.defaultShelfId}
              onChange={(e) => void updateSettings({ defaultShelfId: e.target.value })}
            >
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t.openHotkey}>
            <HotkeyRecorder
              value={settings.openHotkey}
              onChange={async (accel) => {
                if (!(await updateSettings({ openHotkey: accel }))) {
                  showToast(t.hotkeyUnavailable)
                }
              }}
            />
          </Field>

          <div>
            <button
              type="button"
              disabled={clearing}
              className="h-10 w-full rounded-[12px] bg-[var(--pill)] text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pill-hover)] disabled:opacity-50"
              onClick={() => void clearMissing()}
            >
              {t.clearMissing}
            </button>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
              {t.clearMissingHint}
            </p>
          </div>
        </SettingsCard>

        <SettingsCard title={t.autoShelves}>
          <ToggleRow
            label={t.watchDownloads}
            hint={t.watchDownloadsHint}
            checked={settings.watchDownloads}
            onChange={(v) => void updateSettings({ watchDownloads: v })}
          />
          <ToggleRow
            label={t.watchScreenshots}
            hint={t.watchScreenshotsHint}
            checked={settings.watchScreenshots}
            onChange={(v) => void updateSettings({ watchScreenshots: v })}
          />
        </SettingsCard>

        <SettingsCard title={t.gestures}>
          <ToggleRow
            label={t.shakeToOpen}
            hint={t.shakeToOpenHint}
            checked={settings.shakeToOpen}
            onChange={(v) => void updateSettings({ shakeToOpen: v })}
          />
          <Field label={t.edgeReveal}>
            <div className="grid grid-cols-3 gap-1.5">
              {(['off', 'left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={settings.edgeReveal === side}
                  onClick={() => void updateSettings({ edgeReveal: side })}
                  className={cn(
                    'rounded-[10px] py-2 text-[12px] font-medium transition-colors duration-150',
                    settings.edgeReveal === side
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--pill)] text-[var(--muted-foreground)] hover:bg-[var(--pill-hover)] hover:text-[var(--foreground)]'
                  )}
                >
                  {side === 'off' ? t.edgeOff : side === 'left' ? t.edgeLeft : t.edgeRight}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">{t.edgeRevealHint}</p>
          </Field>
        </SettingsCard>

        <SettingsCard title={t.windowsSection}>
          <ToggleRow
            label={t.contextMenuToggle}
            hint={t.contextMenuHint}
            checked={settings.contextMenu}
            onChange={(v) => void updateSettings({ contextMenu: v })}
          />
          <Field label={t.pasteHotkey}>
            <HotkeyRecorder
              value={settings.pasteHotkey}
              onChange={async (accel) => {
                if (!(await updateSettings({ pasteHotkey: accel }))) {
                  showToast(t.hotkeyUnavailable)
                }
              }}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">{t.pasteHotkeyHint}</p>
          </Field>
        </SettingsCard>

        <SettingsCard title={t.rulesSection}>
          <p className="-mt-1 text-[11px] leading-snug text-[var(--muted-foreground)]">{t.rulesHint}</p>
          <RulesEditor />
        </SettingsCard>

        <SettingsCard title={t.syncSection}>
          <SyncCard />
        </SettingsCard>

        <SettingsCard title={t.shelvesSection}>
          <ul className="space-y-0.5">
            {shelves.map((shelf) => (
              <li
                key={shelf.id}
                className="flex items-center justify-between gap-2 rounded-[12px] px-2.5 py-2 hover:bg-[var(--pill)]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: shelf.color }}
                  />
                  <span className="truncate text-[13px] text-[var(--foreground)]">{shelf.name}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn shrink-0 text-[var(--destructive)] disabled:opacity-30"
                  aria-label={t.deleteShelf(shelf.name)}
                  disabled={shelves.length <= 1}
                  onClick={async () => {
                    const ok = await askConfirm({
                      title: t.deleteShelf(shelf.name),
                      message: t.deleteShelfConfirm(shelf.name),
                      confirmLabel: t.delete,
                      danger: true
                    })
                    if (!ok) return
                    try {
                      await window.stash.deleteShelf(shelf.id)
                      await refresh()
                    } catch {
                      showToast(t.cannotDeleteLast)
                    }
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </SettingsCard>

        <SettingsCard title={t.dataSection}>
          <div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => void exportData()}
              >
                <Upload size={15} strokeWidth={1.75} />
                {t.exportData}
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={() => void importData()}
              >
                <Download size={15} strokeWidth={1.75} />
                {t.importData}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
              {t.dataHint}
            </p>
          </div>
          <div>
            <button
              type="button"
              className={cn(SECONDARY_BUTTON, 'w-full')}
              onClick={() => void window.stash.openLogsFolder()}
            >
              <FileText size={15} strokeWidth={1.75} />
              {t.openLogs}
            </button>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
              {t.openLogsHint}
            </p>
          </div>
        </SettingsCard>

        <SettingsCard title={t.updatesSection}>
          <p className="text-center text-[12px] text-[var(--muted-foreground)]">
            {t.currentVersion(appVersion || '—')}
          </p>
          <ToggleRow
            label={t.betaUpdates}
            hint={t.betaUpdatesHint}
            checked={settings.updateChannel === 'beta'}
            onChange={(v) => void updateSettings({ updateChannel: v ? 'beta' : 'stable' })}
          />
          <button
            type="button"
            className="h-10 w-full rounded-[12px] bg-[var(--pill)] text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pill-hover)]"
            onClick={() => void window.stash.checkForUpdates()}
          >
            {updateStatus.state === 'checking' ? t.updateChecking : t.checkUpdates}
          </button>
          {updateStatus.state === 'downloaded' && (
            <button
              type="button"
              className="h-10 w-full rounded-[12px] bg-[var(--accent)] text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              onClick={() => void window.stash.installUpdate()}
            >
              {t.installAndRestart}
            </button>
          )}
          {updateStatus.state === 'downloading' && (
            <p className="text-center text-[12px] text-[var(--muted-foreground)]">
              {t.updateDownloading(updateStatus.percent)}
            </p>
          )}
          {updateStatus.state === 'error' && (
            <div className="space-y-2 text-center">
              <p className="text-[12px] text-[var(--destructive)]">{t.updateError}</p>
              <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
                {t.updateErrorHint}
              </p>
              <button
                type="button"
                className="h-9 w-full rounded-[12px] border border-[var(--border)] text-[12px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pill)]"
                onClick={() => void window.stash.openReleases()}
              >
                {t.downloadManually}
              </button>
            </div>
          )}
        </SettingsCard>

        <p className="pt-1 text-center text-[11px] text-[var(--muted-foreground)]">
          {t.footer}
          {appVersion ? ` · v${appVersion}` : ''}
        </p>
      </div>
    </div>
  )
}

function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-3.5 py-3.5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium text-[var(--foreground)]">{label}</div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-[var(--foreground)]">{label}</div>
        {hint && (
          <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted-foreground)]">{hint}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{ width: 44, height: 24 }}
        className={cn(
          'relative shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-[var(--accent)]' : 'bg-[rgba(128,128,128,0.4)]'
        )}
      >
        <span
          style={{
            width: 18,
            height: 18,
            top: 3,
            left: checked ? 23 : 3,
            transition: 'left 150ms ease'
          }}
          className="absolute rounded-full bg-white shadow-sm"
        />
      </button>
    </div>
  )
}
