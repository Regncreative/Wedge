# FAQ

### Does Wedge move or copy my files?
No. Wedge only remembers **where** a file is. The file stays where it was; removing it from a shelf never deletes it from disk.

The one exception is a **shared shelf** (see below): it *is* a folder, so files you drop there are copied into it, and removing a file from it moves the file to the Recycle Bin.

### A file shows "not found". What happened?
It was moved, renamed or deleted after you added it, or it is on a drive or network share that isn't connected right now. Files on a disconnected share come back when the share does. *Settings → Clear missing files* removes references that are definitely gone; it keeps the ones on unreachable shares.

### How do I open Wedge?
Click one of the colored tabs on the right edge of the screen (move the mouse to the edge and they peek out), click the Wedge icon in the system tray, or press **Ctrl + Shift + Space**. You can change the shortcut in Settings. If the combination you pick is already used by another app, Wedge keeps your previous one and tells you.

### Can I drag several files at once?
Yes. Select them with **Ctrl+click** or **Shift+click** (or Shift + arrow keys), then drag any of the selected files.

### Why do colored tabs slide out of the screen edge when I drag a file?
Those are your shelves. The moment you start dragging files (from Explorer, the desktop, a browser…) they come out of the edge; drop on the one you want. When you're not dragging, only thin stripes show; moving the mouse to the edge makes them peek out, and clicking one pulls its shelf out as a drawer. Dragging a card from the drawer onto another tab moves it there.

The tabs step aside while a full-screen app (a game, a video, a presentation) is running. Move them to another edge or position, or turn them off, in *Settings → Appearance → Where the shelves live*.

Wedge notices a drag by the picture Windows shows next to the cursor while dragging; it doesn't read your mouse or keyboard. A few apps drag without that picture; for those, touch the stripes at the edge and the tabs come out.

### What is the Pocket?
The pale tab at the top. Drop files there from different folders, then drag them all out together from the pocket's drawer. Files you drag out of the pocket into another app leave the pocket by themselves.

### Does the drawer stay open?
It closes when you click somewhere else, like a menu. Pin it with the pin button in its header (*Keep open*) to keep it out.

### How do files get onto shelves automatically?
With *Settings → Automation* on, new files in **Downloads** and new screenshots (Win+Shift+S, when Snipping Tool saves them) appear on their own shelves. Rules, on the same tab, send files elsewhere, e.g. "PDFs from Downloads → Invoices".

### Can I add files without opening Wedge?
- The **tabs on the screen edge** (see above). Links and text work too: drag a link or some selected text from a browser or another app onto a tab, and it's kept as a shortcut or a note.
- Explorer: right-click → **Add to Wedge** (on Windows 11 under *Show more options*).
- Clipboard: copy files, an image ("Copy image" in a browser), a link or text, then press **Ctrl+V** in the drawer.
- Phone: click the phone icon in the drawer and scan the QR code. Your phone and PC must be on the same Wi-Fi; the page works for 15 minutes, only with the code's secret link.

### How do shared shelves work? My Google Drive and my friend's are different.
That's fine: you don't share a Drive, you share **one folder**.

1. In Google Drive (or OneDrive, Dropbox), create a folder and share it with your friend.
2. Your friend opens *Shared with me*, right-clicks the folder and picks *Add shortcut to Drive* (OneDrive: *Add shortcut to My files*). Now the folder appears in their Google Drive for desktop too.
3. In Wedge, each of you clicks **+** in the drawer's header → **Shared shelf…** and picks that folder (for example `G:\My Drive\Project`).

From then on the shelf *is* the folder: files you drop on it are copied into the folder and your cloud app uploads them; files your friend adds appear on your shelf a few seconds after they arrive on your PC. Removing a file from the shelf deletes it from the folder for everyone (it goes to the Recycle Bin). Notes, tags and pins stay on your own PC. Removing the shelf itself leaves the folder and its files alone.

It works the same between your own PCs: link the same folder in OneDrive on both.

### Why did a converted image get bigger?
Older versions saved PNG and WebP without loss, so a photo converted to them could grow. Now *Convert → WebP* uses lossy compression (like JPG) and JPG uses a sensible quality, so photos get smaller. PNG is always lossless, so converting a photo **to** PNG will still make it larger; that's how the format works.

To make a file smaller, use **Reduce size**: it scales very large images down to 2560 px, saves photos as JPG (and images with transparency as WebP), and only keeps the copy if it really is smaller. The message shows the size before and after.

### Keyboard shortcuts

| Key | Action |
|---|---|
| ← / → / ↑ / ↓, Home / End, PgUp / PgDn | Move between files |
| Shift + arrows | Extend the selection |
| Space | Preview the focused file (← / → for the next one) |
| Ctrl + Space | Select / deselect the focused file |
| Ctrl + V | Paste files, an image, a link or text onto the shelf |
| Ctrl + A | Select all files in view |
| Enter | Open the focused file |
| P | Pin / unpin the selection |
| Delete | Remove the selection from the shelf |
| Ctrl + F | Search every shelf (names, notes, tags and text inside files) |
| Esc | Clear the selection, close search or settings, then close the drawer |

### Windows warns "Windows protected your PC" when I install
Wedge is not code-signed yet, so SmartScreen shows this for new downloads. Click **More info → Run anyway**. Updates are not affected: Wedge checks each update's signature itself before installing it.

### How do I move my shelves to another computer?
*Settings → More → Backup → Export* on the old PC, then *Import* on the new one. Shelves with the same name are merged. File paths must exist on the new PC to be usable.

### How do I try new features early?
Turn on *Settings → Updates → Get beta versions*. Turning it off later doesn't downgrade you; you'll get the next stable version when it comes out.

### Where are the logs?
*Settings → More → Log folder → Open* opens `%APPDATA%\Wedge\logs`. Attach `main.log` when you report a bug.

### Why is Stash called Wedge now?
It's the same app with a new name and logo from 2.0 on: "Stash" is used by several well-known products, and Wedge says what it does, it wedges your files into the edge of the screen.

### I used Stash. What happens to my shelves?
Nothing you need to do: Stash 1.x updates itself to Wedge 2.0, the installer replaces the old app, and on the first start your shelves and settings move from `%APPDATA%\Stash` to `%APPDATA%\Wedge`. Exports from Stash can be imported into Wedge too.

### Does Wedge collect any data?
No. See [PRIVACY.md](../PRIVACY.md).
