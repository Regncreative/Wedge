# Contributing to Stash

Thanks for helping! Issues and pull requests are welcome.

## Setup

Stash is a Windows app. You need **Windows 10/11** and **Node.js 22** (see `.nvmrc`).

```bash
npm ci
npm run dev
```

`npm ci` also rebuilds `better-sqlite3` for Electron. If that fails, check that you are on Node 22: newer majors have no prebuilt binary and fall back to compiling, which needs the Visual Studio C++ build tools.

## Checks

```bash
npm run lint
npm run typecheck
npm test              # unit tests (Vitest, runs on Electron's Node)
npm run build
npm run test:e2e      # end-to-end tests against the built app (Playwright)
```

CI runs all of these on Windows; a pull request can only be merged when they pass.

`STASH_USER_DATA=<folder>` starts the app on a separate profile, which is handy for trying things without touching your own shelves.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) so the history and release notes stay readable:

- `feat: multi-select files with Ctrl/Shift+click`
- `fix: keep previous hotkey when the new one is taken`
- `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `build:`

## Code layout

```text
src/main/           Electron main process
  database/         SQLite access and schema migrations
  ipc.ts            IPC handlers
  ipc-schemas.ts    zod schemas for every IPC argument
  ipc-validate.ts   handle()/on() wrappers: sender check + validation
  data-transfer.ts  export / import
  logging.ts        electron-log setup
src/preload/        contextBridge API exposed as window.stash
src/renderer/       React UI
src/shared/         Types, IPC channel names, translations (locales/)
tests/unit/         Vitest
tests/e2e/          Playwright
packaging/          winget manifests, Microsoft Store notes
```

Rules of thumb:

- **IPC:** register handlers with `handle()` / `on()` from `ipc-validate.ts` and give every argument a schema. Never use `ipcMain` directly.
- **Database:** schema changes go in a new entry at the end of `src/main/database/migrations.ts`. Never edit a migration that has shipped.
- **UI:** keep to the existing Fluent panel style. Interactive elements need an accessible name and must work with the keyboard.
- **Strings:** never hard-code UI text; add it to `Messages` in `src/shared/i18n.ts` and to every file in `src/shared/locales/`.

## Translations

Translations live in `src/shared/locales/`. To add a language:

1. Copy `en.ts` to `<code>.ts` (for example `de.ts`) and translate the strings.
2. Register it in `dictionaries` and `resolveSystemLanguage` in `src/shared/i18n.ts`, and add the code to `AppLanguage` in `src/shared/types.ts`.

TypeScript fails the build if a string is missing, and a unit test checks that every language has the same keys.

## Releasing (maintainers)

1. Move the `Unreleased` notes in `CHANGELOG.md` under a new version heading, for example `## [1.1.0] - 2026-11-02`.
2. Bump the version and tag it:
   ```bash
   npm version minor
   git push --follow-tags
   ```
3. The **Release** workflow runs every check, builds the installer, and creates a **draft** GitHub Release with the notes from `CHANGELOG.md`. Review it and click *Publish release*. Only then do users receive it.
4. Optional staged rollout: run the **Rollout** workflow (Actions → Rollout → Run workflow) with the tag and a percentage (for example 10, then 50, then 100). Setting 0 halts a bad release.

**Beta versions:** use a pre-release version such as `npm version 1.2.0-beta.1`. The workflow marks the release as a pre-release, so only users who turned on *Get beta versions* receive it.
