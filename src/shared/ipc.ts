/** IPC channel names — single source of truth */

export const IpcChannels = {
  // Window
  WINDOW_HIDE: 'window:hide',
  WINDOW_SHOWN: 'window:shown',
  WINDOW_PIN: 'window:pin',
  WINDOW_IS_PINNED: 'window:is-pinned',
  WINDOW_SET_OPACITY: 'window:set-opacity',

  // Files
  FILES_LIST: 'files:list',
  FILES_ADD: 'files:add',
  FILES_REMOVE: 'files:remove',
  FILES_CLEAR_MISSING: 'files:clear-missing',
  FILES_PIN: 'files:pin',
  FILES_MOVE: 'files:move',
  FILES_OPEN: 'files:open',
  FILES_REVEAL: 'files:reveal',
  FILES_COPY_PATH: 'files:copy-path',
  FILES_PROPERTIES: 'files:properties',
  FILES_START_DRAG: 'files:start-drag',
  FILES_ICON: 'files:icon',

  // Shelves
  SHELVES_LIST: 'shelves:list',
  SHELVES_CREATE: 'shelves:create',
  SHELVES_RENAME: 'shelves:rename',
  SHELVES_DELETE: 'shelves:delete',
  SHELVES_UPDATE: 'shelves:update',

  // Stats
  STATS_GET: 'stats:get',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // System
  THEME_GET: 'theme:get',
  THEME_CHANGED: 'theme:changed',
  NOTIFY: 'notify',
  APP_GET_VERSION: 'app:get-version',
  OPEN_RELEASES: 'app:open-releases',
  OPEN_LOGS: 'app:open-logs',

  // Updates
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
  UPDATE_GET_STATUS: 'update:get-status'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
