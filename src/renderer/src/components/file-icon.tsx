import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  Heart,
  Briefcase,
  Inbox,
  Package,
  Clock,
  GraduationCap,
  Download,
  Camera,
  Smartphone,
  Clipboard
} from 'lucide-react'
import { classifyExtension } from '@shared/types'
import type { StashFile } from '@shared/types'
import { cn } from '@/lib/utils'

const SHELF_ICONS: Record<string, typeof Inbox> = {
  inbox: Inbox,
  briefcase: Briefcase,
  heart: Heart,
  folder: Folder,
  package: Package,
  clock: Clock,
  graduation: GraduationCap,
  download: Download,
  camera: Camera,
  smartphone: Smartphone,
  clipboard: Clipboard
}

export function ShelfIcon({
  name,
  color,
  className
}: {
  name: string
  color?: string
  className?: string
}) {
  const Icon = SHELF_ICONS[name] ?? Folder
  return <Icon className={cn('h-4 w-4', className)} style={color ? { color } : undefined} strokeWidth={1.75} />
}

const ICON_WRAP =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]'

export function FileTypeIcon({
  file,
  className
}: {
  file: Pick<StashFile, 'extension' | 'isDirectory' | 'name'>
  className?: string
}) {
  const kind = classifyExtension(file.extension, file.isDirectory)
  const iconClass = cn('h-[18px] w-[18px]', className)

  switch (kind) {
    case 'folders':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#f59e0b]/15')}>
          <Folder className={cn(iconClass, 'text-[#f59e0b]')} strokeWidth={1.75} />
        </div>
      )
    case 'images':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#10b981]/15')}>
          <FileImage className={cn(iconClass, 'text-[#10b981]')} strokeWidth={1.75} />
        </div>
      )
    case 'videos':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#8b5cf6]/15')}>
          <FileVideo className={cn(iconClass, 'text-[#8b5cf6]')} strokeWidth={1.75} />
        </div>
      )
    case 'audio':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#ec4899]/15')}>
          <FileAudio className={cn(iconClass, 'text-[#ec4899]')} strokeWidth={1.75} />
        </div>
      )
    case 'archives':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#f97316]/15')}>
          <FileArchive className={cn(iconClass, 'text-[#f97316]')} strokeWidth={1.75} />
        </div>
      )
    case 'pdf':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#ef4444]/15')}>
          <FileText className={cn(iconClass, 'text-[#ef4444]')} strokeWidth={1.75} />
        </div>
      )
    case 'office': {
      const ext = file.extension.toLowerCase()
      const isWord = ['doc', 'docx', 'odt', 'rtf'].includes(ext)
      const isExcel = ['xls', 'xlsx', 'ods', 'csv'].includes(ext)
      const color = isWord ? '#3b82f6' : isExcel ? '#22c55e' : '#a855f7'
      return (
        <div className={cn(ICON_WRAP)} style={{ background: `${color}26` }}>
          <FileText className={iconClass} style={{ color }} strokeWidth={1.75} />
        </div>
      )
    }
    case 'code':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#06b6d4]/15')}>
          <FileCode className={cn(iconClass, 'text-[#06b6d4]')} strokeWidth={1.75} />
        </div>
      )
    case 'executables':
      return (
        <div className={cn(ICON_WRAP, 'bg-[#64748b]/15')}>
          <Package className={cn(iconClass, 'text-[#94a3b8]')} strokeWidth={1.75} />
        </div>
      )
    default:
      return (
        <div className={cn(ICON_WRAP, 'bg-white/5')}>
          <File className={cn(iconClass, 'text-[var(--muted-foreground)]')} strokeWidth={1.75} />
        </div>
      )
  }
}
