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
  <img src="docs/edge-tabs.png" alt="Shelf tabs sliding out of the screen edge during a drag" width="224">
  &nbsp;
  <img src="docs/panel-dark.png" alt="A shelf pulled out as a drawer, dark theme" width="300">
  &nbsp;
  <img src="docs/panel-light.png" alt="A shelf pulled out as a drawer, light theme" width="300">
</p>

## What is Stash?

Windows doesn’t have a convenient place to park files while you work — so people pile them on the desktop, spam Downloads, or lose track mid-flow.

**Stash** puts your shelves on the edge of the screen. Start dragging a file anywhere and colored shelf tabs slide out; drop it on one. Click a tab and that shelf opens like a drawer, ready to drag files back into any app. Stash stores **references only** — your files stay where they are on disk.

Designed to feel like a built-in Windows 11 feature (Fluent Design), and light like one: a **5 MB installer** that uses the WebView2 runtime built into Windows.

## Features

**Collect from anywhere**
- **Shelves on the screen edge** — tucked-in tabs that slide out the moment you start dragging a file, from Explorer, the desktop or a browser; drop on the shelf you want
- **Drawers** — click a tab to pull its shelf out; drag a card onto another tab to move it
- **Pocket** — collect files from different folders, then drag them all out in one go (the pocket empties itself)
- **Automatic shelves** — new downloads and screenshots appear on their own shelves; rules send files to the right shelf by type
- **Right-click → Add to Stash** in Explorer, **Ctrl+V** for files, images, links and text, and **from your phone** by scanning a QR code

**Share**
- **Shared shelves** — turn a Google Drive, OneDrive or Dropbox folder into a shelf. Files you drop are copied into the folder; whatever a friend (or your other PC) puts there shows up on your shelf. Everyone keeps their own Drive and just links the same shared folder

**Find and use**
- **Previews everywhere** — thumbnails in the list, a grid view, Space for Quick Look, and previews in desktop widgets
- **Search inside files** — PDF, Word, Excel, PowerPoint, text and code, across every shelf
- **Quick actions** — ZIP, convert images (JPG, PNG, lossy WebP), **reduce size** (never makes a file bigger), copy into a folder, open all, drag a whole shelf as one ZIP
- **Notes, tags and reminders** on any file; **temporary shelves** that clean themselves up
- **Desktop widgets** — pin a shelf to the desktop

**Plus**
- **Its own look** — colored index tabs, cards with real previews, dark and light themes
- **System tray integration** — silent background app, always one click away
- **Multi-select** — Ctrl/Shift+click, then drag, pin or remove several files at once
- **Keyboard friendly** — navigate, open, pin and remove without the mouse ([shortcuts](docs/FAQ.md#keyboard-shortcuts))
- **Global shortcut** — open the drawer with `Ctrl+Shift+Space` (customizable)
- **Turkish & English** — full UI + tray localization
- **Auto update** — updates from GitHub Releases, with an opt-in beta channel; every update is signature-checked
- **Export / import** — move your shelves and settings to another PC
- **Small and light** — 5 MB installer, low memory use, browser engine kept up to date by Windows
- **Missing-file awareness** — deleted or moved files show as unavailable until you clear them
- **Private by design** — no account, no telemetry ([privacy](PRIVACY.md))

## Screenshots

<p align="center">
  <img src="docs/pocket.png" alt="The pocket: collect files, drag them out together" width="300">
  &nbsp;
  <img src="docs/shared-shelf.png" alt="Creating a shared shelf from a cloud folder" width="300">
  &nbsp;
  <img src="docs/settings.png" alt="Stash settings" width="300">
</p>

## Installation

### For everyone (recommended)

1. Download from **[stash.regncreative.com](https://stash.regncreative.com)** or the **[latest release](https://github.com/Regncreative/Stash/releases/latest)** (`Stash_<version>_x64-setup.exe`)
2. Run the installer
3. Launch **Stash** — it appears in the system tray
4. Start dragging a file: your shelves slide out of the right edge of the screen. Or click a tab, the tray icon, or press `Ctrl+Shift+Space`

> Tip: enable **Start with Windows** in Settings so Stash is ready after sign-in.
>
> Upgrading from 1.x happens automatically: the 2.0 installer replaces the old app and keeps all your shelves and settings.

### For developers

Requires Windows 10/11, [Node.js 22](https://nodejs.org) (`.nvmrc`), [Rust](https://rustup.rs) and the Visual Studio C++ Build Tools ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

```bash
npm ci
npm run dev
```

The app starts in the tray with its tabs tucked into the right screen edge. Click a tab, the tray icon or use the hotkey to open the drawer. See [CONTRIBUTING.md](CONTRIBUTING.md) for tests and conventions.

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
│  Edge window · Drag watch · Widgets     │
│  SQLite (rusqlite) · validated commands │
└───────────────────┬─────────────────────┘
                    │ invoke / events
┌───────────────────▼─────────────────────┐
│     React tabs and drawer (WebView2)    │
│  window.stash API · shelves · settings  │
└─────────────────────────────────────────┘
```

## Project structure

```text
src/
  renderer/       React UI (edge tabs, drawer, widgets); lib/api.ts bridges to Rust
  shared/         Types and translations (locales/)
src-tauri/
  src/            Rust backend: commands, database, edge window, drag watch, shared shelves, updater
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
- [x] Multi-select, keyboard navigation, export / import
- [x] Automated, staged releases with a beta channel
- [x] 2.0: rebuilt on Tauri (5 MB installer, signed updates)
- [x] Automatic shelves, rules, content search, Quick Look
- [x] Phone to PC, desktop widgets, quick actions
- [x] Shelves on the screen edge, pocket, shared shelves (cloud folders), new design
- [ ] Share links (needs a hosting decision)
- [ ] New demo GIF
- [ ] Code signing
- [ ] Microsoft Store and winget
- [ ] Plugins / extensions
- [ ] Smarter / AI-assisted search

## Releases & auto-update

Installed copies check [GitHub Releases](https://github.com/Regncreative/Stash/releases) for updates on launch and from the tray / Settings. Users can opt into beta versions in Settings.

Releases are built by GitHub Actions, not on a developer machine: push a version tag and the **Release** workflow tests, builds and uploads the installer to a draft release for review. Rollouts can be staged with the **Rollout** workflow. See [CONTRIBUTING.md](CONTRIBUTING.md#releasing-maintainers).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks and conventions, and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## License

[MIT](LICENSE) © Regncreative
