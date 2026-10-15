# Contributing to Wedge

Thanks for helping! Issues and pull requests are welcome.

## Setup

Wedge is a Windows app built with [Tauri 2](https://v2.tauri.app): a Rust backend and a React panel rendered by WebView2. You need:

- Windows 10 or 11
- [Node.js 22](https://nodejs.org) (see `.nvmrc`)
- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- Visual Studio C++ Build Tools ("Desktop development with C++")

See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for details. Then:

```bash
npm ci
npm run dev
```

The first Rust build takes a few minutes; later ones are incremental.

`STASH_USER_DATA=<folder>` runs the app on a separate profile instead of `%APPDATA%\Wedge`, which is handy for trying things without touching your own shelves. The end-to-end tests also set `STASH_DOWNLOADS_DIR` / `STASH_SCREENSHOTS_DIR` (folders to watch instead of the real ones), `STASH_TRASH_DIR` (where shared-shelf removals go instead of the Recycle Bin), `STASH_PHONE_LOOPBACK` (phone server on 127.0.0.1 only) and `STASH_SHOW_ON_START`.

## Checks

```bash
npm run lint          # ESLint + Clippy
npm run typecheck
npm test              # frontend unit tests (Vitest)
npm run test:rust     # backend unit tests (cargo test)
npm run build:e2e     # debug build with the UI embedded
npm run test:e2e      # Playwright drives the real wedge.exe over WebView2
npm run test:perf     # performance numbers (opt-in, see below)
```

Real Windows drag and drop is tested too, by moving the mouse cursor (`tests/e2e/real-drop.spec.ts`). Those tests only run with `STASH_REAL_INPUT=1`, on a machine nobody is using at the time; the helpers refuse to press or release the mouse anywhere but on Wedge's own windows.

Performance is measured by `npm run test:perf` (`tests/e2e/perf.spec.ts`): start-up, idle CPU and memory, how fast the edge reacts, animation frames, and a shelf with a thousand files. It prints the numbers and checks generous budgets; it is left out of the regular run because timings depend on the machine.

Close any running Wedge before the end-to-end tests: Wedge is single-instance, so a running copy would swallow the test launches.

CI runs all of these on Windows; a pull request can only be merged when they pass.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) so the history and release notes stay readable:

- `feat: multi-select files with Ctrl/Shift+click`
- `fix: keep previous hotkey when the new one is taken`
- `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `build:`

## Code layout

```text
src/renderer/src/       React panel
  lib/api.ts            window.stash: every backend call goes through here
src/shared/             Types and translations (locales/)
src-tauri/src/
  commands.rs           Core Tauri commands (validate every argument here)
  commands_extra.rs     Notes, reminders, rules, search, actions, clipboard, preview
  db.rs                 SQLite access and schema migrations (incl. FTS5 index)
  services.rs           Downloads/Screenshots watchers, expiry, reminders, indexing
  shared.rs             Shared shelves: a shelf mirroring a (cloud) folder
  textract.rs           Text from Office/OpenDocument, PDF and text files
  actions.rs            ZIP, image conversion and size reduction, copy into folder
  dragdrop.rs           File drops in every window (WebView2 file objects → paths)
  dragwatch.rs          Notices file drags anywhere (the shell's drag image window)
  widget.rs             Desktop widgets
  phone.rs              Phone → PC upload server (QR)
  shell.rs              Explorer context menu, clipboard files
  transfer.rs           Export / import
  files.rs              Non-blocking file checks
  win.rs                Shell icons, thumbnails, Properties (Win32)
  panel.rs              The edge window: tab column and drawer; the part that catches the cursor, per mode
  tray.rs               Tray icon and menu
  hotkey.rs             Global shortcuts
  updater.rs            Signed updates, beta feed, staged rollout
  i18n.rs               Native strings (tray, notifications)
src-tauri/windows/      Installer hooks (upgrade from 1.x)
tests/unit/, tests/e2e/ Vitest and Playwright
```

Rules of thumb:

- **Commands:** validate every argument in `commands.rs` before touching the database or the file system; deserialization rejects unknown fields.
- **Database:** schema changes go in a new entry at the end of `MIGRATIONS` in `db.rs`. Never edit a migration that has shipped. 1.x and 2.x share the same `stash.db`.
- **Blocking work:** file-system and shell calls run off the UI thread (`spawn_blocking`) and must not hang on unreachable network paths.
- **Windows:** create windows from an async command (or post to the main thread from another thread). `run_on_main_thread` runs immediately when already on the main thread, so creating a window in a synchronous command or during `setup` deadlocks or leaves the webview unloaded. Extra windows are opened once the panel reports `app_ready`.
- **UI:** use the design tokens in `styles/globals.css` (`--surface`, `--fg-2`, `--accent-soft`…) and the shared classes (`btn`, `btn-icon`, `field`, `chip`, `menu-item`, `flyout`). Interactive elements need an accessible name and must work with the keyboard.
- **Strings:** never hard-code UI text; add it to `Messages` in `src/shared/i18n.ts` and every file in `src/shared/locales/`. Tray and notification strings live in `src-tauri/src/i18n.rs`.

## Translations

Translations live in `src/shared/locales/`. To add a language:

1. Copy `en.ts` to `<code>.ts` (for example `de.ts`) and translate the strings.
2. Register it in `dictionaries` and `resolveSystemLanguage` in `src/shared/i18n.ts`, and add the code to `AppLanguage` in `src/shared/types.ts`.
3. Add the tray and notification strings to `src-tauri/src/i18n.rs`.

TypeScript fails the build if a string is missing, and a unit test checks that every language has the same keys.

## Releasing (maintainers)

Releases are built by GitHub Actions. One-time setup: add the repository secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of the updater private key) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Keep a backup of that key somewhere safe: **if it is lost, installed copies can no longer be updated.**

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new version heading, for example `## [2.1.0] - 2026-11-02`.
2. Bump the version and tag it:
   ```bash
   npm version minor
   git push --follow-tags
   ```
3. The **Release** workflow runs every check, builds and signs the installer, verifies the signature, and creates a **draft** GitHub Release with the notes from `CHANGELOG.md`. Review it and click *Publish release*. Only then do users receive it.
4. Optional staged rollout: run the **Rollout** workflow (Actions → Rollout → Run workflow) with the tag and a percentage (for example 10, then 50, then 100). Setting 0 halts a bad release.

**Beta versions:** use a pre-release version such as `npm version 2.1.0-beta.1`. The workflow marks the release as a pre-release; after you publish it, the **Beta channel** workflow points the beta feed at it, so only users who turned on *Get beta versions* receive it.

`package.json` holds the version; `src-tauri/tauri.conf.json` reads it from there. Keep `src-tauri/Cargo.toml` in step.
