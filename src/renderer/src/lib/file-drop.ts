import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { droppedText } from './dropped-text'

/**
 * Files dragged in from Explorer, links and text dragged in from other apps,
 * and our own files dragged onto a shelf.
 *
 * The page handles the HTML drag events itself (so every window accepts
 * drops, whenever it was created) and passes the dropped `File` objects to
 * WebView2 with `postMessageWithAdditionalObjects`; the backend
 * (src-tauri/src/dragdrop.rs) reads their real paths and sends them back as
 * `stash-drop-paths`. A link or text needs no backend to read it: the page
 * reports it as `drop-text`. Positions are CSS pixels in this window.
 *
 * While one of our own files is being dragged out (see `dragOut`), the only
 * drop targets in our window are elements marked `data-drop-shelf`: dropping
 * there moves the file to that shelf.
 */
export type FileDropEvent =
  | { type: 'enter'; x: number; y: number }
  | { type: 'over'; x: number; y: number }
  | { type: 'leave' }
  | { type: 'drop'; x: number; y: number; paths: string[] }
  /** A link or text, from a browser, an editor… */
  | { type: 'drop-text'; x: number; y: number; text: string; title?: string }
  /** One of our own files is over a shelf (or no longer: null). */
  | { type: 'internal-over'; shelfId: string | null }

type Listener = (event: FileDropEvent) => void

interface DropInfo {
  window: string
  id: number
  x: number
  y: number
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessageWithAdditionalObjects?: (message: unknown, objects: ArrayLike<unknown>) => void
      }
    }
  }
}

const listeners = new Set<Listener>()
let installed = false
let depth = 0
let nextId = 0
/** Shelf our own drag was dropped on (read when the drag ends). */
let internalTarget: string | null = null

function emit(event: FileDropEvent): void {
  listeners.forEach((listener) => listener(event))
}

function draggingOut(): boolean {
  return document.body.dataset.stashDragging === '1'
}

const TEXT_TYPES = ['text/uri-list', 'text/plain']

/** A drag from outside carrying files, a link or text (not one of our own outbound drags). */
function isIncomingDrag(e: DragEvent): boolean {
  if (draggingOut()) return false
  const types = Array.from(e.dataTransfer?.types ?? [])
  return types.includes('Files') || TEXT_TYPES.some((type) => types.includes(type))
}

/**
 * How to take a drag: files and text as a copy, a link that only lets itself
 * be linked as a link. Never as a move, which would cut the text out of the
 * app it came from.
 */
function dropEffectFor(data: DataTransfer): DataTransfer['dropEffect'] {
  if (Array.from(data.types).includes('Files')) return 'copy'
  switch (data.effectAllowed) {
    case 'link':
    case 'linkMove':
      return 'link'
    case 'move':
    case 'none':
      return 'none'
    default:
      return 'copy'
  }
}

/** The shelf drop target (`data-drop-shelf`) under a point, if any. */
export function shelfAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-shelf]')
  return el?.dataset.dropShelf ?? null
}

/**
 * Start handling drags. Called at startup, before React renders: until a
 * page handles `dragover`, WebView2 would open a dropped file itself.
 */
export function installFileDrop(): void {
  if (installed) return
  installed = true
  const self = getCurrentWebviewWindow()
  const label = self.label
  window.addEventListener('dragenter', (e) => {
    if (!isIncomingDrag(e)) return
    e.preventDefault()
    if (depth++ === 0) emit({ type: 'enter', x: e.clientX, y: e.clientY })
  })
  window.addEventListener('dragover', (e) => {
    if (draggingOut()) {
      const shelf = shelfAt(e.clientX, e.clientY)
      if (shelf) {
        e.preventDefault()
        // The native drag only offers "copy"; any other effect refuses the drop.
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      }
      emit({ type: 'internal-over', shelfId: shelf })
      return
    }
    if (!isIncomingDrag(e)) return
    // Without this WebView2 refuses the drop (or opens the file).
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = dropEffectFor(e.dataTransfer)
    emit({ type: 'over', x: e.clientX, y: e.clientY })
  })
  window.addEventListener('dragleave', (e) => {
    if (draggingOut()) {
      if (!e.relatedTarget) emit({ type: 'internal-over', shelfId: null })
      return
    }
    if (!isIncomingDrag(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) emit({ type: 'leave' })
  })
  window.addEventListener('drop', (e) => {
    e.preventDefault()
    if (draggingOut()) {
      internalTarget = shelfAt(e.clientX, e.clientY)
      emit({ type: 'internal-over', shelfId: null })
      return
    }
    const incoming = isIncomingDrag(e)
    depth = 0
    emit({ type: 'leave' })
    const data = e.dataTransfer
    if (!incoming || !data) return
    if (data.files.length > 0) {
      const post = window.chrome?.webview?.postMessageWithAdditionalObjects
      if (!post) return
      const info: DropInfo = { window: label, id: ++nextId, x: e.clientX, y: e.clientY }
      post.call(window.chrome?.webview, `stash-drop:${JSON.stringify(info)}`, data.files)
      return
    }
    const dropped = droppedText((format) => data.getData(format))
    if (dropped) emit({ type: 'drop-text', x: e.clientX, y: e.clientY, ...dropped })
  })
  void self.listen<{ info: DropInfo; paths: string[] }>('stash-drop-paths', ({ payload }) => {
    if (payload.info.window !== label) return
    emit({ type: 'drop', x: payload.info.x, y: payload.info.y, paths: payload.paths })
  })
}

export function onFileDrop(listener: Listener): () => void {
  installFileDrop()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** How a drag out of Stash ended. */
export interface DragOutcome {
  /** Shelf (`data-drop-shelf`) it was dropped on in our own window. */
  shelf: string | null
  /** Some app (or Stash) took the files. */
  dropped: boolean
}

/**
 * Drag files out to other apps (a native drag, run by the backend). Resolves
 * when the drag ends.
 */
export async function dragOut(start: () => Promise<boolean>): Promise<DragOutcome> {
  document.body.dataset.stashDragging = '1'
  internalTarget = null
  let dropped = false
  try {
    dropped = await start()
  } catch {
    // Cancelled or failed: nothing to do.
  } finally {
    delete document.body.dataset.stashDragging
  }
  const shelf = internalTarget
  internalTarget = null
  return { shelf, dropped: dropped || shelf !== null }
}
