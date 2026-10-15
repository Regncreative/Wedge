import type { StashFile } from '@shared/types'
import { CODE_EXTS, OFFICE_EXTS } from '@shared/types'
import { FileTypeIcon } from './file-icon'
import { cn } from '@/lib/utils'

/** Label colors for documents drawn as paper. */
const DOC_LABELS: Record<string, string> = {
  pdf: '#d8443a',
  doc: '#2f6fe4',
  docx: '#2f6fe4',
  odt: '#2f6fe4',
  rtf: '#2f6fe4',
  xls: '#1f9a55',
  xlsx: '#1f9a55',
  ods: '#1f9a55',
  csv: '#1f9a55',
  ppt: '#d9622b',
  pptx: '#d9622b',
  odp: '#d9622b',
  txt: '#6f7486',
  md: '#6f7486'
}

function isPaper(ext: string): boolean {
  return ext in DOC_LABELS || OFFICE_EXTS.has(ext) || CODE_EXTS.has(ext)
}

/**
 * The picture for a file: Windows' thumbnail when there is one, a sheet of
 * paper with a colored type label for documents, otherwise the file's icon.
 */
export function FileThumb({
  file,
  thumb,
  icon,
  className
}: {
  file: StashFile
  thumb: string | null
  icon: string | null
  className?: string
}) {
  const ext = file.extension.toLowerCase()
  if (thumb) {
    return (
      <img
        src={thumb}
        alt=""
        draggable={false}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }
  if (!file.isDirectory && isPaper(ext)) {
    return (
      <div className={cn('paper-doc h-full w-full', className)}>
        <b style={{ background: DOC_LABELS[ext] ?? '#6f7486' }}>{ext.toUpperCase().slice(0, 4)}</b>
      </div>
    )
  }
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center bg-[var(--thumb-bg)]',
        className
      )}
    >
      {icon && !file.isDirectory ? (
        <img src={icon} alt="" draggable={false} className="h-12 w-12 object-contain" />
      ) : (
        <FileTypeIcon file={file} size={52} />
      )}
    </div>
  )
}
