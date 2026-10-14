# Changelog

All notable changes to Stash are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Multi-select with Ctrl/Shift+click or the keyboard; drag, pin or remove several files at once.
- Full keyboard navigation of the file list (see the FAQ for shortcuts).
- Welcome screen on first launch.
- Export and import of shelves and settings.
- Opt-in beta update channel.
- Logs in `%APPDATA%\Stash\logs` and an "Open logs folder" button.
- The uninstaller asks whether to delete shelves and settings.

### Changed
- The database schema is versioned and backed up before upgrades.
- Releases are built and published by GitHub Actions, as drafts reviewed before going out, with optional staged rollout.

### Fixed
- Launching Stash while it is already running no longer starts a second copy against the same database; it just opens the panel.
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

[Unreleased]: https://github.com/Regncreative/Stash/compare/v1.0.4...HEAD
[1.0.4]: https://github.com/Regncreative/Stash/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Regncreative/Stash/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Regncreative/Stash/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Regncreative/Stash/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Regncreative/Stash/releases/tag/v1.0.0
