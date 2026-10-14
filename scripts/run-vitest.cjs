/**
 * Run Vitest on Electron's bundled Node instead of the system Node.
 *
 * `npm ci` rebuilds better-sqlite3 for Electron's ABI (postinstall), so the
 * native module can't load in plain Node. ELECTRON_RUN_AS_NODE makes the
 * Electron binary behave like Node, and Vitest's forked workers inherit it.
 */
const { spawnSync } = require('child_process')
const path = require('path')

const electron = require('electron') // resolves to the binary path in Node
const vitest = path.join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs')

const result = spawnSync(electron, [vitest, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
