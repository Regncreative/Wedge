# Privacy

_Last updated: 2026-10-14_

Stash is a local app. It has no account, no analytics and no telemetry.

## What Stash stores

Everything stays on your computer, in `%APPDATA%\Stash`:

- **`stash.db`**: your shelves, the **paths** of the files you added (name, size, dates, pin state) and your settings. Stash never copies, uploads or reads the contents of your files.
- **`stash.db.backup`**: a copy taken automatically before a database upgrade.
- **`logs\main.log`**: technical logs for troubleshooting (versions, errors). Logs can contain file paths. They are never sent anywhere; you choose whether to attach them to a bug report.

Uninstalling Stash asks whether to delete this folder too.

## Network access

Stash connects to the internet only to check for updates:

- **GitHub** (`github.com`, `objects.githubusercontent.com`) to look for and download new versions. GitHub sees your IP address and app version as with any download. See the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- The copy from the **Microsoft Store** does not do this; the Store handles updates instead.

## Exports

*Settings → Data → Export* writes your shelves and file paths to a JSON file wherever you choose. It contains folder and file names, so treat it like any other personal document.

## Contact

Questions: open an issue at [github.com/Regncreative/Stash](https://github.com/Regncreative/Stash/issues) or use the contact on [stash.regncreative.com](https://stash.regncreative.com).
