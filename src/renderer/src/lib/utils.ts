import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Windows path → file:// URL with each segment percent-encoded, so names
 * containing `#`, `%` or `?` aren't cut off as URL fragments or queries.
 * Handles drive paths (C:\…) and UNC shares (\\server\share\…).
 */
export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const encoded = normalized
    .split('/')
    .map((segment, i) =>
      i === 0 && /^[a-zA-Z]:$/.test(segment) ? segment : encodeURIComponent(segment)
    )
    .join('/')
  return normalized.startsWith('//') ? `file:${encoded}` : `file:///${encoded}`
}
