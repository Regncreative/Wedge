import { useEffect, useState } from 'react'
import { getMessages, type Messages } from '@/lib/i18n'

/** Theme, accent and strings for the secondary windows (edge handle, widgets). */
export function useWindowSetup(): Messages | null {
  const [t, setT] = useState<Messages | null>(null)
  useEffect(() => {
    const apply = () =>
      Promise.all([window.stash.getSettings(), window.stash.getSystemTheme()]).then(
        ([settings, system]) => {
          const theme = settings.theme === 'system' ? system : settings.theme
          const root = document.documentElement
          root.classList.toggle('light', theme === 'light')
          root.classList.toggle('dark', theme === 'dark')
          root.style.setProperty('--accent', settings.accentColor)
          root.lang = settings.language
          setT(getMessages(settings.language))
        }
      )
    void apply()
    const off = window.stash.onThemeChanged(() => void apply())
    window.addEventListener('focus', apply)
    return () => {
      off()
      window.removeEventListener('focus', apply)
    }
  }, [])
  return t
}
