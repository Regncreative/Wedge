# Security Policy

## Supported versions

Only the latest release receives security fixes. Stash updates itself automatically, so please make sure you are on the newest version before reporting.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: open the [Security tab](https://github.com/Regncreative/Stash/security) and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and the Stash and Windows versions. You will get an acknowledgement within 7 days. Once a fix is released, you will be credited in the release notes unless you prefer otherwise.

## Scope

Of particular interest:
- The auto-update channel (anything that could make Stash install something other than an official, signed release)
- The command bridge between the panel (WebView2) and the Rust backend
- Handling of file paths, shortcuts (`.lnk`) and drag and drop
