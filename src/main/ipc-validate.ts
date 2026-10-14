import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

type Schemas = [] | [z.ZodTypeAny, ...z.ZodTypeAny[]]
type Args<S extends Schemas> = { [K in keyof S]: S[K] extends z.ZodTypeAny ? z.output<S[K]> : never }

/** Only the app's own panel page may call into the main process. */
function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url
  if (!url) return false
  if (url.startsWith('file://')) return true
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return Boolean(devUrl && url.startsWith(devUrl))
}

function parseArgs<S extends Schemas>(channel: string, schemas: S, raw: unknown[]): Args<S> {
  // Trailing optional arguments may be omitted by the renderer entirely.
  const padded = schemas.map((_, i) => raw[i])
  const result = z.tuple(schemas as [z.ZodTypeAny, ...z.ZodTypeAny[]]).safeParse(padded)
  if (!result.success) {
    console.warn(`[stash] rejected IPC call ${channel}:`, result.error.issues)
    throw new Error(`Invalid arguments for ${channel}`)
  }
  return result.data as Args<S>
}

/** `ipcMain.handle` with sender check and zod-validated arguments. */
export function handle<S extends Schemas>(
  channel: string,
  schemas: S,
  fn: (...args: Args<S>) => unknown
): void {
  ipcMain.handle(channel, (event, ...raw: unknown[]) => {
    if (!isTrustedSender(event)) throw new Error(`Untrusted sender for ${channel}`)
    return fn(...parseArgs(channel, schemas, raw))
  })
}

/** `ipcMain.on` (fire-and-forget) with the same checks; bad calls are dropped. */
export function on<S extends Schemas>(
  channel: string,
  schemas: S,
  fn: (event: IpcMainEvent, ...args: Args<S>) => void
): void {
  ipcMain.on(channel, (event, ...raw: unknown[]) => {
    if (!isTrustedSender(event)) return
    try {
      fn(event, ...parseArgs(channel, schemas, raw))
    } catch (err) {
      console.warn(`[stash] ${channel} failed:`, err)
    }
  })
}
