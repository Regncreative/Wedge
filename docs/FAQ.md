# FAQ

### Does Stash move or copy my files?
No. Stash only remembers **where** a file is. The file stays where it was; removing it from a shelf never deletes it from disk.

### A file shows "not found". What happened?
It was moved, renamed or deleted after you added it, or it is on a drive or network share that isn't connected right now. Files on a disconnected share come back when the share does. *Settings → Clear missing files* removes references that are definitely gone; it keeps the ones on unreachable shares.

### How do I open the panel?
Click the Stash icon in the system tray, or press **Ctrl + Shift + Space**. You can change the shortcut in Settings. If the combination you pick is already used by another app, Stash keeps your previous one and tells you.

### Can I drag several files at once?
Yes. Select them with **Ctrl+click** or **Shift+click** (or Shift + arrow keys), then drag any of the selected files.

### Keyboard shortcuts

| Key | Action |
|---|---|
| ↑ / ↓, Home / End, PgUp / PgDn | Move between files |
| Shift + arrows | Extend the selection |
| Space | Select / deselect the focused file |
| Ctrl + A | Select all files in view |
| Enter | Open the focused file |
| P | Pin / unpin the selection |
| Delete | Remove the selection from the shelf |
| Ctrl + F | Search |
| Esc | Clear the selection / close search or settings |

### Windows warns "Windows protected your PC" when I install
Stash is not code-signed yet, so SmartScreen shows this for new downloads. Click **More info → Run anyway**. The Microsoft Store version (once available) doesn't show this warning.

### How do I move my shelves to another computer?
*Settings → Data → Export* on the old PC, then *Import* on the new one. Shelves with the same name are merged. File paths must exist on the new PC to be usable.

### How do I try new features early?
Turn on *Settings → Updates → Get beta versions*. Turning it off later doesn't downgrade you; you'll get the next stable version when it comes out.

### Where are the logs?
*Settings → Data → Open logs folder* opens `%APPDATA%\Stash\logs`. Attach `main.log` when you report a bug.

### Does Stash collect any data?
No. See [PRIVACY.md](../PRIVACY.md).
