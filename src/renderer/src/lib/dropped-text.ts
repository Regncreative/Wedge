/** A link or some text dragged in from another app. */
export interface DroppedText {
  text: string
  /** The link's own text, when the app it came from gives it (browsers do). */
  title?: string
}

type GetData = (format: string) => string

/** The text of the first link in some HTML (a browser's drag of a link carries one). */
function anchorText(html: string): string | undefined {
  if (typeof DOMParser === 'undefined') return undefined
  // An inert document: nothing in it runs or loads.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.querySelector('a[href]')?.textContent ?? undefined
}

function linkTitle(get: GetData, url: string, parseHtml: (html: string) => string | undefined) {
  const candidates = [
    parseHtml(get('text/html')),
    // Firefox: the address, then the title, on two lines.
    get('text/x-moz-url').split(/\r?\n/)[1],
    get('text/plain')
  ]
  for (const candidate of candidates) {
    const title = candidate?.replace(/\s+/g, ' ').trim()
    if (title && title !== url && !/^https?:\/\//i.test(title)) return title.slice(0, 200)
  }
  return undefined
}

/**
 * What a drop of a link or text carries: the first web address in it (with
 * its title, if the drag has one), else its plain text. Null when it has
 * neither.
 */
export function droppedText(get: GetData, parseHtml = anchorText): DroppedText | null {
  const url = get('text/uri-list')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'))
  if (url && /^https?:\/\/\S+$/i.test(url)) {
    const title = linkTitle(get, url, parseHtml)
    return title ? { text: url, title } : { text: url }
  }
  const text = get('text/plain')
  return text.trim() ? { text } : null
}
