# FAQ

### Does Stash move or copy my files?
No. Stash only remembers **where** a file is. The file stays where it was; removing it from a shelf never deletes it from disk.

### A file shows "not found". What happened?
It was moved, renamed or deleted after you added it, or it is on a drive or network share that isn't connected right now. Files on a disconnected share come back when the share does. *Settings → Clear missing files* removes references that are definitely gone; it keeps the ones on unreachable shares.

### How do I open the panel?
Click the Stash icon in the system tray, or press **Ctrl + Shift + Space**. You can change the shortcut in Settings. If the combination you pick is already used by another app, Stash keeps your previous one and tells you.

### Can I drag several files at once?
Yes. Select them with **Ctrl+click** or **Shift+click** (or Shift + arrow keys), then drag any of the selected files.

### What is the drop shelf?
While dragging a file anywhere in Windows, **shake the mouse left and right**: a small shelf opens next to the cursor. Drop the file there, go and collect more from other folders, then drag them all out together with *Drag all*. The drop shelf clears itself after 24 hours. You can also open it from the tray menu, or turn the gesture off in *Settings → Gestures*.

### How do files get onto shelves automatically?
With *Settings → Automatic shelves* on, new files in **Downloads** and new screenshots (Win+Shift+S, when Snipping Tool saves them) appear on their own shelves. *Settings → Rules* sends files elsewhere, e.g. "PDFs from Downloads → Invoices".

### Can I add files without opening Stash?
- Explorer: right-click → **Add to Stash** (on Windows 11 under *Show more options*).
- Clipboard: copy files, an image ("Copy image" in a browser), a link or text, then press **Ctrl+V** in the panel.
- Phone: click the phone icon in the panel and scan the QR code. Your phone and PC must be on the same Wi-Fi; the page works for 15 minutes, only with the code's secret link.

### How does "paste into file dialogs" work?
Select a file in Stash, then in any Open or Save window press **Ctrl+Alt+V** (changeable in Settings): the file's full path is filled in. With nothing selected, the most recently used file is used.

### How do I sync shelves between PCs?
*Settings → Sync between PCs → Choose folder* and pick a folder inside OneDrive, Dropbox or Google Drive; do the same on the other PC. Shelves, notes and file lists stay in step; files in your synced cloud folders open on both PCs. Automatic shelves (Downloads, Screenshots…) stay on each PC.

### Keyboard shortcuts

| Key | Action |
|---|---|
| ↑ / ↓, Home / End, PgUp / PgDn | Move between files |
| Shift + arrows | Extend the selection |
| Space | Preview the focused file (← / → for the next one) |
| Ctrl + Space | Select / deselect the focused file |
| Ctrl + V | Paste files, an image, a link or text onto the shelf |
| Ctrl + A | Select all files in view |
| Enter | Open the focused file |
| P | Pin / unpin the selection |
| Delete | Remove the selection from the shelf |
| Ctrl + F | Search |
| Esc | Clear the selection / close search or settings |

### Windows warns "Windows protected your PC" when I install
Stash is not code-signed yet, so SmartScreen shows this for new downloads. Click **More info → Run anyway**. Updates are not affected: Stash checks each update's signature itself before installing it.

### How do I move my shelves to another computer?
*Settings → Data → Export* on the old PC, then *Import* on the new one. Shelves with the same name are merged. File paths must exist on the new PC to be usable.

### How do I try new features early?
Turn on *Settings → Updates → Get beta versions*. Turning it off later doesn't downgrade you; you'll get the next stable version when it comes out.

### Where are the logs?
*Settings → Data → Open logs folder* opens `%APPDATA%\Stash\logs`. Attach `main.log` when you report a bug.

### I used Stash 1.x. What happens to my shelves?
Nothing you need to do: 1.x updates itself to 2.0, the installer replaces the old app, and 2.0 opens the same shelves and settings. Export from 1.x is also compatible with 2.0's import.

### Does Stash collect any data?
No. See [PRIVACY.md](../PRIVACY.md).
