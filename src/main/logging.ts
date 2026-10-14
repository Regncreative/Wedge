import { app, shell } from 'electron'
import log from 'electron-log/main'
import { dirname } from 'path'

/**
 * Persist main-process logs to %APPDATA%\Stash\logs\main.log so bug reports
 * can include them. Existing console.* calls are routed into the log file.
 */
export function initLogging(): void {
  log.transports.file.level = 'info'
  log.transports.file.maxSize = 2 * 1024 * 1024 // rotates to main.old.log
  log.transports.console.level = app.isPackaged ? false : 'debug'
  Object.assign(console, log.functions)

  log.errorHandler.startCatching({ showDialog: false })

  app.on('render-process-gone', (_event, _contents, details) => {
    log.error('[stash] renderer process gone', details)
  })
  app.on('child-process-gone', (_event, details) => {
    log.error('[stash] child process gone', details)
  })

  log.info(`[stash] v${app.getVersion()} starting (electron ${process.versions.electron})`)
}

export function openLogsFolder(): Promise<string> {
  return shell.openPath(dirname(log.transports.file.getFile().path))
}
