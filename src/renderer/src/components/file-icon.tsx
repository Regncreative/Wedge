import {
  BookOpen,
  Briefcase,
  Camera,
  Clipboard,
  Clock,
  Cloud,
  Code2,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  GraduationCap,
  Heart,
  Image,
  Inbox,
  Music,
  Package,
  Smartphone,
  Star,
  Users
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { StashFile } from '@shared/types'
import { classifyExtension } from '@shared/types'
import { cn } from '@/lib/utils'

export const SHELF_ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  folder: Folder,
  briefcase: Briefcase,
  heart: Heart,
  star: Star,
  package: Package,
  clock: Clock,
  graduation: GraduationCap,
  book: BookOpen,
  image: Image,
  music: Music,
  code: Code2,
  download: Download,
  camera: Camera,
  smartphone: Smartphone,
  clipboard: Clipboard,
  users: Users,
  cloud: Cloud
}

export function ShelfIcon({
  name,
  color,
  className,
  size = 18
}: {
  name: string
  color?: string
  className?: string
  size?: number
}) {
  const Icon = SHELF_ICONS[name] ?? Folder
  return (
    <Icon
      size={size}
      className={className}
      style={color ? { color } : undefined}
      strokeWidth={1.75}
      aria-hidden
    />
  )
}

type Kind = ReturnType<typeof classifyExtension>

const KIND_STYLE: Record<Kind, { icon: LucideIcon; color: string }> = {
  folders: { icon: Folder, color: '#f5a524' },
  images: { icon: FileImage, color: '#17c964' },
  videos: { icon: FileVideo, color: '#9353d3' },
  audio: { icon: FileAudio, color: '#f31260' },
  archives: { icon: FileArchive, color: '#f97316' },
  pdf: { icon: FileText, color: '#e5484d' },
  office: { icon: FileText, color: '#3b82f6' },
  executables: { icon: Package, color: '#8b95a5' },
  code: { icon: FileCode, color: '#06b6d4' },
  unknown: { icon: File, color: '#8b8b95' },
  all: { icon: File, color: '#8b8b95' }
}

function officeStyle(ext: string): { icon: LucideIcon; color: string } {
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext))
    return { icon: FileSpreadsheet, color: '#22a35a' }
  if (['ppt', 'pptx', 'odp'].includes(ext)) return { icon: FileText, color: '#d9541e' }
  return { icon: FileText, color: '#2f6fe4' }
}

/** A tinted tile with a glyph for the file's kind (used when Windows has no icon). */
export function FileTypeIcon({
  file,
  size = 40,
  className
}: {
  file: Pick<StashFile, 'extension' | 'isDirectory'>
  size?: number
  className?: string
}) {
  const kind = classifyExtension(file.extension, file.isDirectory)
  const ext = file.extension.toLowerCase()
  const { icon: Icon, color } = kind === 'office' ? officeStyle(ext) : KIND_STYLE[kind]
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-[22%]', className)}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 16%, transparent)`
      }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.48)} style={{ color }} strokeWidth={1.75} />
    </div>
  )
}
