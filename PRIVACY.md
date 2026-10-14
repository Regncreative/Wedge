# Privacy

_Last updated: 2026-10-14 (Stash 2.0)_

Stash is a local app. It has no account, no analytics and no telemetry.

## What Stash stores

Everything stays on your computer, in `%APPDATA%\Stash`:

- **`stash.db`**: your shelves, the **paths** of the files you added (name, size, dates, pin state, your notes and tags) and your settings. Stash does not copy or upload your files.
- **A search index** inside `stash.db`: text extracted from files on your shelves (documents, PDFs, text files), so search can find words inside them. It never leaves your PC; removing a file from a shelf removes its text.
- **`clips\`** and **`inbox\`**: images, links and text you paste into Stash, and files sent from your phone. Removing them from the shelf deletes these copies.
- **`stash.db.backup`**: a copy taken automatically before a database upgrade.
- **`logs\main.log`**: technical logs for troubleshooting (versions, errors). Logs can contain file paths. They are never sent anywhere; you choose whether to attach them to a bug report.

Windows' WebView2 component, which draws the panel, keeps its cache in `%LOCALAPPDATA%\com.regncreative.stash`.

When uninstalling, tick *Delete the application data* to remove both folders.

## Folders Stash watches

With *Automatic shelves* on, Stash notices new files in your **Downloads** and **Pictures\Screenshots** folders and lists them. Turn either off in Settings.

If you link a **shared shelf**, Stash also watches that folder (only its top level) so files added there show up on the shelf.

Stash doesn't read your keyboard or mouse outside its own windows. The edge handle is an ordinary small window; it only sees drags and clicks on itself.

## Network access

**Phone to PC:** only while the *Send from your phone* window is open (at most 15 minutes), Stash accepts uploads on your local network at an address with a random secret, shown as a QR code. Nothing is sent to the internet.

**Shared shelves:** a shared shelf is a folder you choose, typically inside Google Drive, OneDrive or Dropbox. Files you drop on it are **copied into that folder**, and your cloud app uploads them and shares them with whoever the folder is shared with, under the cloud provider's own terms. Stash itself doesn't contact any server for this, and it never writes your notes, tags or other shelves there.

Apart from that, Stash connects to the internet only to check for updates:

- **GitHub** (`github.com`, `objects.githubusercontent.com`) to look for and download new versions. GitHub sees your IP address and app version as with any download. See the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

The panel is drawn by Microsoft Edge WebView2, a part of Windows. Stash loads no web content into it; WebView2's own diagnostic data follows your Windows privacy settings.

## Exports

*Settings → Data → Export* writes your shelves and file paths to a JSON file wherever you choose. It contains folder and file names, so treat it like any other personal document.

## Contact

Questions: open an issue at [github.com/Regncreative/Stash](https://github.com/Regncreative/Stash/issues) or use the contact on [stash.regncreative.com](https://stash.regncreative.com).
