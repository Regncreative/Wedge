import { formatBytes } from '@shared/types'

export { formatBytes }

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** "14:32" today, "Yesterday 09:10", "12 Oct", or "12.10.2025" for older years. */
export function formatWhen(ts: number, lang: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  if (sameDay(d, now)) return time
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return `${lang === 'tr' ? 'Dün' : 'Yesterday'} ${time}`
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })
  }
  return d.toLocaleDateString(lang)
}

/** Weekday and time, for reminders. */
export function formatReminder(ms: number, lang: string): string {
  return new Date(ms).toLocaleString(lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}
