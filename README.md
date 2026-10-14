<p align="center">
  <img src="docs/logo.png" alt="Stash logo" width="96" height="96">
</p>

<h1 align="center">Stash</h1>

<p align="center">
  <strong>A modern file shelf for Windows</strong><br>
  Keep files within reach — without cluttering your desktop.
</p>

<p align="center">
  <a href="https://stash.regncreative.com"><strong>stash.regncreative.com</strong></a>
</p>

<p align="center">
  <a href="https://stash.regncreative.com"><img src="https://img.shields.io/badge/website-stash.regncreative.com-2563EB" alt="Website"></a>
  <a href="https://github.com/Regncreative/Stash/actions/workflows/ci.yml"><img src="https://github.com/Regncreative/Stash/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/Regncreative/Stash/actions/workflows/codeql.yml"><img src="https://github.com/Regncreative/Stash/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="https://github.com/Regncreative/Stash/releases/latest"><img src="https://img.shields.io/github/v/release/Regncreative/Stash?label=latest%20release" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/Electron-34-47848F?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT"></a>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="Stash demo — drag files onto the tray shelf" width="900">
</p>

## What is Stash?

Windows doesn’t have a convenient place to park files while you work — so people pile them on the desktop, spam Downloads, or lose track mid-flow.

**Stash** adds a lightweight file shelf that lives in the system tray. Drop files onto shelves, pin what matters, then drag them back into any app when you need them. Stash stores **references only** — your files stay where they are on disk.

Designed to feel like a built-in Windows 11 feature (Fluent Design), not a typical Electron utility.

## Features

- **System tray integration** — silent background app, always one click away
- **Drag & drop shelves** — drop files in, drag them out to Explorer, browsers, and other apps
- **Multi-select** — Ctrl/Shift+click, then drag, pin or remove several files at once
- **Keyboard friendly** — navigate, open, pin and remove without the mouse ([shortcuts](docs/FAQ.md#keyboard-shortcuts))
- **Global shortcut** — open the panel with `Ctrl+Shift+Space` (customizable)
- **Multiple shelves** — organize by context (Work, Personal, Temporary…)
- **Instant search & filters** — find files by name, type, or shelf
- **Fluent Design UI** — dark/light themes, accent colors, smooth motion
- **Turkish & English** — full UI + tray localization
- **Auto launch** — start with Windows (installed builds)
- **Auto update** — updates from GitHub Releases, with an opt-in beta channel
- **Export / import** — move your shelves and settings to another PC
- **SQLite storage** — fast local metadata, no cloud required, automatic backup before upgrades
- **Missing-file awareness** — deleted or recycled paths show as unavailable until you clear them
- **Private by design** — no account, no telemetry ([privacy](PRIVACY.md))

## Screenshots

<p align="center">
  <img src="docs/panel-dark.jpg" alt="Stash panel — dark mode" width="360">
  &nbsp;
  <img src="docs/panel-light.jpg" alt="Stash panel — light mode" width="360">
</p>

<p align="center">
  <img src="docs/settings.jpg" alt="Stash settings" width="360">
  &nbsp;
  <img src="docs/settings-behavior.jpg" alt="Stash settings — sorting and shelves" width="360">
</p>

<p align="center">
  <img src="docs/tray.jpg" alt="Stash in the Windows system tray" width="420">
</p>

## Installation

### For everyone (recommended)

1. Download from **[stash.regncreative.com](https://stash.regncreative.com)** or **[Stash-Setup.exe](https://github.com/Regncreative/Stash/releases/latest)**
2. Run the installer
3. Launch **Stash** — it appears in the system tray
4. Click the tray icon (or press `Ctrl+Shift+Space`) to open the panel

> Tip: enable **Start with Windows** in Settings so Stash is ready after sign-in.

### For developers

```bash
npm install
npm run dev
```

The app starts silently in the tray. Click the tray icon or use the hotkey to open the panel.

## Development

Requires Windows and Node.js 22 (`.nvmrc`).

| Command | Description |
|---------|-------------|
| `npm run dev` | Development mode |
| `npm run build` | Production build (`out/`) |
| `npm run dist` | Build Windows installer locally |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests against the built app (Playwright) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Tech stack

- **Electron** + **React** + **TypeScript** + **Vite** (`electron-vite`)
- **Tailwind CSS** + **Framer Motion** + **Zustand**
- **better-sqlite3** for local storage, **zod** for IPC validation, **electron-log** for logs
- **electron-builder** + **electron-updater** for packaging and updates
- **Vitest** + **Playwright** for tests, GitHub Actions on Windows for CI and releases

## Architecture

```text
┌─────────────────────────────────────────┐
│                 Windows                 │
│  Tray · Global hotkey · Shell / files   │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│            Electron Main                │
│  Window · Tray · Auto-launch · Updater  │
└───────────────────┬─────────────────────┘
                    │ IPC
┌───────────────────▼─────────────────────┐
│           Preload bridge                │
│         window.stash (typed API)        │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│           React Renderer                │
│     Fluent panel · shelves · settings   │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│               SQLite                    │
│     shelves · file refs · settings      │
└─────────────────────────────────────────┘
```

## Project structure

```text
src/
  main/           Electron main — tray, panel window, IPC, auto-launch
    database/     SQLite schema + queries
  preload/        contextBridge API (`window.stash`)
  renderer/       React UI (Fluent panel)
  shared/         Shared types, i18n, IPC channel names
resources/        Tray / app icons
docs/             README images
```

## Roadmap

- [x] System tray panel
- [x] Shelves & drag-and-drop
- [x] Global shortcut
- [x] Themes, accents, localization (TR/EN)
- [x] Auto update via GitHub Releases
- [x] Idle opacity & missing-file cleanup
- [x] Official demo GIF in README
- [x] Multi-select, keyboard navigation, export / import
- [x] Automated, staged releases with a beta channel
- [ ] Code signing
- [ ] Microsoft Store and winget
- [ ] Plugins / extensions
- [ ] Optional cloud sync
- [ ] Smarter / AI-assisted search

## Releases & auto-update

Installed copies check [GitHub Releases](https://github.com/Regncreative/Stash/releases) for updates on launch and from the tray / Settings. Users can opt into beta versions in Settings.

Releases are built by GitHub Actions, not on a developer machine: push a version tag and the **Release** workflow tests, builds and uploads the installer to a draft release for review. Rollouts can be staged with the **Rollout** workflow. See [CONTRIBUTING.md](CONTRIBUTING.md#releasing-maintainers).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks and conventions, and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## License

[MIT](LICENSE) © Regncreative
