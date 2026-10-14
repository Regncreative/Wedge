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
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-backend-B7410E?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT"></a>
</p>

<p align="center">
  <img src="docs/demo.gif" alt="Stash demo — drag files onto the tray shelf" width="900">
</p>

## What is Stash?

Windows doesn’t have a convenient place to park files while you work — so people pile them on the desktop, spam Downloads, or lose track mid-flow.

**Stash** adds a lightweight file shelf that lives in the system tray. Drop files onto shelves, pin what matters, then drag them back into any app when you need them. Stash stores **references only** — your files stay where they are on disk.

Designed to feel like a built-in Windows 11 feature (Fluent Design), and light like one: a **3 MB installer** that uses the WebView2 runtime built into Windows.

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
- **Small and light** — 3 MB installer, low memory use, browser engine kept up to date by Windows
- **Verified updates** — every update is signature-checked before it installs
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

1. Download from **[stash.regncreative.com](https://stash.regncreative.com)** or the **[latest release](https://github.com/Regncreative/Stash/releases/latest)** (`Stash_<version>_x64-setup.exe`)
2. Run the installer
3. Launch **Stash** — it appears in the system tray
4. Click the tray icon (or press `Ctrl+Shift+Space`) to open the panel

> Tip: enable **Start with Windows** in Settings so Stash is ready after sign-in.
>
> Upgrading from 1.x happens automatically: the 2.0 installer replaces the old app and keeps all your shelves and settings.

### For developers

Requires Windows 10/11, [Node.js 22](https://nodejs.org) (`.nvmrc`), [Rust](https://rustup.rs) and the Visual Studio C++ Build Tools ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

```bash
npm ci
npm run dev
```

The app starts silently in the tray. Click the tray icon or use the hotkey to open the panel. See [CONTRIBUTING.md](CONTRIBUTING.md) for tests and conventions.

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Run the app with hot reload |
| `npm run build` | Release build + installer (`src-tauri/target/release/bundle/nsis/`) |
| `npm test` | Frontend unit tests (Vitest) |
| `npm run test:rust` | Backend unit tests (cargo test) |
| `npm run build:e2e` then `npm run test:e2e` | End-to-end tests against the real app (Playwright over WebView2) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint + Clippy |

## Tech stack

- **Tauri 2** with a **Rust** backend; UI in **React** + **TypeScript** + **Vite**
- **Tailwind CSS** + **Framer Motion** + **Zustand**
- **rusqlite** (SQLite), the **windows** crate for shell icons and Properties, **drag** for native drag-out
- Tauri plugins for tray, global shortcut, autostart, notifications, dialogs, logging and signed updates
- **Vitest**, **cargo test** + **Playwright** for tests, GitHub Actions on Windows for CI and releases

## Architecture

```text
┌─────────────────────────────────────────┐
│                 Windows                 │
│  Tray · Global hotkey · Shell / files   │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│           Rust backend (Tauri)          │
│  Panel window · Tray · Updater · Shell  │
│  SQLite (rusqlite) · validated commands │
└───────────────────┬─────────────────────┘
                    │ invoke / events
┌───────────────────▼─────────────────────┐
│        React panel (WebView2)           │
│  window.stash API · shelves · settings  │
└─────────────────────────────────────────┘
```

## Project structure

```text
src/
  renderer/       React panel (Fluent UI); lib/api.ts bridges to Rust
  shared/         Types and translations (locales/)
src-tauri/
  src/            Rust backend: commands, database, tray, updater, shell
  windows/        Installer hooks (upgrade from 1.x)
  tauri.conf.json App, window, bundle and updater configuration
tests/
  unit/           Vitest
  e2e/            Playwright, driving the real stash.exe
scripts/          Release helpers
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
- [x] 2.0: rebuilt on Tauri (3 MB installer, signed updates)
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
