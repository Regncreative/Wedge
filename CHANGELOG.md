# Changelog

All notable changes to Wedge (called Stash before 2.0) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Russian, by [@alkidnn](https://github.com/alkidnn): Wedge speaks Russian on Russian Windows, including the tray menu, notifications, the phone page and File Explorer's entry.

### Fixed
- On some Windows 10 PCs the tabs never showed and dragging a file did nothing, because Windows reported a full-screen app that wasn't there. Wedge now checks for a full-screen window itself, only on the monitor with the tabs, and writes to its log when the tabs step aside.
- In the Microsoft Store version, Settings no longer says the File Explorer entry is under "Show more options" on Windows 11; there it's in the first menu.

## [2.0.1] - 2026-10-16

### Added
- A Microsoft Store package (MSIX): the Store installs its updates, starting with Windows uses the package's startup task, and "Add to Wedge" sits in Windows 11's first right-click menu. The installer on GitHub works as before.

### Fixed
- "Add to Wedge" in File Explorer no longer puts files on the Downloads, Screenshots or phone shelf when that was the last one opened; they go to the default shelf instead.
- A temporary shelf's tab says how long it keeps files ("Keeps 1 day", "1 gün kalır") instead of a label cut off at the edge.

## [2.0.0] - 2026-10-15

Stash is now **Wedge**: the same app with a new name and logo, rebuilt on Tauri with a new design. Your shelves and settings carry over, and the app is much smaller and safer.

### Added in 2.0
- **Shelves on the screen edge:** colored index tabs tucked into the edge slide out the moment a file drag starts anywhere in Windows; drop on a shelf. Clicking a tab pulls its shelf out as a drawer (cards with real previews, search, menus). The tray icon and hotkey open the drawer; it closes when you click elsewhere unless pinned. Tabs step aside during full-screen apps.
- **Pocket:** a shelf at the top of the edge that collects files for later; drag them all out together and it empties itself.
- **Shelf colors and icons** from the shelf menu.
- **Shared shelves:** link a Google Drive, OneDrive or Dropbox folder as a shelf; files you drop are copied into it and files others add show up for you.
- **Drag a card onto another shelf's tab** to move it there.
- **Automatic shelves** for new downloads and screenshots, and **rules** that route files to shelves by type and source.
- **Search inside files** (PDF, Word, Excel, PowerPoint, OpenDocument, text and code) across every shelf, diacritic-insensitive.
- **Quick Look** preview with Space; Ctrl+Space toggles selection. Desktop widgets preview on hover and with Space.
- **Quick actions:** ZIP, convert images, **reduce size**, copy into a folder, open all, drag a shelf as one ZIP. Conversions report the size before and after.
- **Notes, tags and reminders** on files; **temporary shelves** that clear themselves.
- **Explorer "Add to Stash"** context menu, **Ctrl+V** for files/images/links/text, and **phone to PC** via QR code.
- **Desktop widgets:** pin a shelf to the desktop.

### Changed
- **New name and logo: Wedge.** On the first start, shelves and settings move from `%APPDATA%\Stash` to `%APPDATA%\Wedge`, and File Explorer's entry becomes "Add to Wedge".
- Starting with Windows and the File Explorer entry are offered on the welcome screen instead of being turned on without asking.
- Rebuilt on Tauri 2 with a Rust backend. The installer is under 5 MB instead of 90 MB and the app uses far less memory.
- The panel is drawn by WebView2, which Windows keeps up to date, instead of a bundled Chromium that no longer received security fixes (Electron 34).
- 1.x installs upgrade automatically; the old app is removed and its data is reused.
- Image previews are rendered by Windows (thumbnails) instead of loading files into the panel.
- WebP conversion is lossy (quality 80) and JPG uses quality 82, so converted photos no longer grow; PNG uses maximum compression.
- Dropping files works the same in every Wedge window (tabs, drawer, widgets), using WebView2's own drop handling.
- The tray panel is replaced by the edge drawer; the idle-fade setting is gone.
- Nothing runs while Wedge sits idle: desktop widgets hear about changes instead of checking every 5 seconds, files of one type share one icon, and the edge window never resizes while you use it.

### Security
- Every update is verified against Wedge's signing key before it installs.

### Added
- Multi-select with Ctrl/Shift+click or the keyboard; drag, pin or remove several files at once.
- Full keyboard navigation of the file list (see the FAQ for shortcuts).
- Welcome screen on first launch.
- Export and import of shelves and settings.
- Opt-in beta update channel.
- Logs in `%APPDATA%\Wedge\logs` and an "Open logs folder" button.
- The uninstaller asks whether to delete shelves and settings.

### Changed (since 1.0.4)
- The database schema is versioned and backed up before upgrades.
- Releases are built and published by GitHub Actions, as drafts reviewed before going out, with optional staged rollout.

### Fixed
- Launching Wedge while it is already running no longer starts a second copy against the same database; it just opens the panel.
- Recording a hotkey with the Windows key no longer saves it as Ctrl.
- Unreachable network paths no longer freeze the app; file checks run asynchronously with a timeout.
- Choosing a hotkey that is already taken keeps the previous one and shows a message.
- Dropping files shows a single confirmation instead of two toasts plus a Windows notification.
- Image previews work for file names containing `#` or `%`.

### Security
- Renderer runs sandboxed.
- Every IPC call is validated and only accepted from the app's own window.

## [1.0.4] - 2026-07-28
### Changed
- UI language follows the Windows display language.
- Windows branding (name, icon, publisher) on the executable.

## [1.0.3] - 2026-07-26
### Fixed
- Auto-update installs on unsigned builds.
### Added
- App version shown in Settings.

## [1.0.2] - 2026-07-25
### Added
- The last selected shelf is restored on launch.
- Panel UI resets when it is reopened.

## [1.0.1] - 2026-07-25
### Added
- Turkish and English localization.
- Idle fade for the panel.
- Auto-update from GitHub Releases.

## [1.0.0] - 2026-07-24
- Initial release: tray file shelf with shelves, drag and drop, search, and global hotkey.

[Unreleased]: https://github.com/Regncreative/Wedge/compare/v2.0.1...HEAD
[2.0.1]: https://github.com/Regncreative/Wedge/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Regncreative/Wedge/compare/v1.0.4...v2.0.0
[1.0.4]: https://github.com/Regncreative/Wedge/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Regncreative/Wedge/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Regncreative/Wedge/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Regncreative/Wedge/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Regncreative/Wedge/releases/tag/v1.0.0
