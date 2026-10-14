import type { StashApi } from './lib/api'

declare global {
  interface Window {
    stash: StashApi
  }
}

export {}
