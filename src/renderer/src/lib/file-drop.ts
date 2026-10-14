import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

/**
 * Files dragged in from Explorer, and our own files dragged onto a shelf.
 *
 * The page handles the HTML drag events itself (so every window accepts
 * drops, whenever it was created) and passes the dropped `File` objects to
 * WebView2 with `postMessageWithAdditionalObjects`; the backend
 * (src-tauri/src/dragdrop.rs) reads their real paths and sends them back as
 * `stash-drop-paths`. Positions are CSS pixels in this window.
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

/** A drag carrying files from outside, not one of our own outbound drags. */
function isFileDrag(e: DragEvent): boolean {
  if (draggingOut()) return false
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
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
    if (!isFileDrag(e)) return
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
    if (!isFileDrag(e)) return
    // Without this WebView2 refuses the drop (or opens the file).
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    emit({ type: 'over', x: e.clientX, y: e.clientY })
  })
  window.addEventListener('dragleave', (e) => {
    if (draggingOut()) {
      if (!e.relatedTarget) emit({ type: 'internal-over', shelfId: null })
      return
    }
    if (!isFileDrag(e)) return
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
    const wasFileDrag = isFileDrag(e)
    depth = 0
    emit({ type: 'leave' })
    if (!wasFileDrag || !e.dataTransfer) return
    const post = window.chrome?.webview?.postMessageWithAdditionalObjects
    if (!post || e.dataTransfer.files.length === 0) return
    const info: DropInfo = { window: label, id: ++nextId, x: e.clientX, y: e.clientY }
    post.call(window.chrome?.webview, `stash-drop:${JSON.stringify(info)}`, e.dataTransfer.files)
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

/**
 * Drag files out to other apps (a native drag, run by the backend). Resolves
 * when the drag ends, with the shelf it was dropped on if it landed on one
 * of ours.
 */
export async function dragOut(start: () => Promise<void>): Promise<string | null> {
  document.body.dataset.stashDragging = '1'
  internalTarget = null
  try {
    await start()
  } catch {
    // Cancelled or failed: nothing to do.
  } finally {
    delete document.body.dataset.stashDragging
  }
  const target = internalTarget
  internalTarget = null
  return target
}
