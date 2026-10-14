# Changelog

All notable changes to Stash are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Unreachable network paths no longer freeze the app; file checks run asynchronously with a timeout.
- Choosing a hotkey that is already taken keeps the previous one and shows a message.
- Dropping files shows a single confirmation instead of two toasts plus a Windows notification.
- Image previews work for file names containing `#` or `%`.

### Security
- Renderer runs sandboxed.

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
