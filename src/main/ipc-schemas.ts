import { z } from 'zod'

/** Argument schemas for IPC handlers. Kept free of Electron imports so they are unit-testable. */

export const id = z.string().min(1).max(100)
export const optionalShelfId = id.nullish()

/** Windows extended-length paths can reach 32,767 characters. */
export const filePath = z.string().min(1).max(32_767)
export const filePaths = z.array(filePath).max(10_000)
export const fileIds = z.array(id).min(1).max(10_000)

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const shelfName = z.string().trim().min(1).max(100)
const shelfIcon = z.string().min(1).max(50)

export const shelfInput = z
  .object({ name: shelfName, icon: shelfIcon.optional(), color: hexColor.optional() })
  .strict()

export const shelfUpdates = z
  .object({
    name: shelfName,
    icon: shelfIcon,
    color: hexColor,
    sortOrder: z.number().int()
  })
  .partial()
  .strict()

export const settingsPatch = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    accentColor: hexColor,
    startWithWindows: z.boolean(),
    language: z.enum(['tr', 'en']),
    openHotkey: z.string().min(1).max(100),
    defaultShelfId: id,
    lastShelfId: id,
    notifications: z.boolean(),
    fileSort: z.enum(['added', 'name', 'recent', 'size']),
    idleOpacity: z.number().finite(),
    idleTimeoutSec: z.number().finite(),
    updateChannel: z.enum(['stable', 'beta']),
    onboardingDone: z.boolean()
  })
  .partial()
  .strict()

export const shortText = z.string().max(500)
