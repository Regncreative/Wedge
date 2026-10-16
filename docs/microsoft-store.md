# Publishing Wedge in the Microsoft Store

Wedge goes into the Store as an **MSIX package**. The Store signs it (no code-signing certificate needed) and installs its updates; the installer on GitHub Releases stays as it is for everyone else. Requirements are from the [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies) and the [MSIX submission guide](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msix/create-app-submission).

## What the Store build does differently

`npm run build:msix` builds `wedge.exe` with `--features store` and packages it ([scripts/build-msix.mjs](../scripts/build-msix.mjs), manifest in [msix/AppxManifest.xml](../msix/AppxManifest.xml)):

|                                 | Regular installer                                        | Store package                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Updates                         | Wedge checks GitHub Releases and installs signed updates | The Store; Settings says so and has no update buttons                                                                                                 |
| Start with Windows              | A Run key                                                | The package's startup task (`WedgeStartup`)                                                                                                           |
| "Add to Wedge" in File Explorer | Registry keys (Windows 11: under _Show more options_)    | A COM extension declared by the package ([msix/shell-ext](../msix/shell-ext)), in the first menu on Windows 11; switching it off in Settings hides it |
| Data                            | `%APPDATA%\Wedge`                                        | The package's LocalState; on the first start it copies the data of a Wedge installed from GitHub                                                      |
| Signing                         | Not signed yet                                           | Signed by the Store                                                                                                                                   |

## Where Wedge stands

| Requirement                              | Policy         | Status                                                                                             |
| ---------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| MSIX package with a valid manifest       | 10.2           | Done: `makeappx` validates it on every build                                                       |
| Package identity from Partner Center     | Partner Center | Done: **Wedge Shelf** (Store ID `9NKP6WX9QGL7`), in `scripts/build-msix.mjs`                       |
| `runFullTrust` justified                 | 10.2.4         | Text below, for the submission's restricted-capabilities box                                       |
| Ask before changing the user's Windows   | 10.2.8         | Done: starting with Windows and the File Explorer entry are offered on the welcome screen          |
| Clean uninstall                          | 10.2.7         | Done by Windows: removing a package removes its startup task, its File Explorer entry and its data |
| Responsive, no crashes                   | 10.4.2         | Done: drags and slow file work stay off the UI thread; a watchdog logs any freeze                  |
| Privacy policy                           | 10.5.1         | Done: [PRIVACY.md](../PRIVACY.md); give its URL in Partner Center                                  |
| Publisher name differs from product name | Partner Center | Done: Regncreative / Wedge                                                                         |

## Steps

1. **Partner Center**: the app is reserved as **Wedge Shelf** (an MSIX or PWA app; "Wedge" was taken). The Store shows that name; Start and the app say Wedge.
2. **Identity**: `scripts/build-msix.mjs` has the values from _Product management → Product identity_ (`Regncreative.WedgeShelf`, publisher `CN=72B69D57-C9E8-4280-AF56-B142286B0D20`). They never change.
3. **Build**: push a version tag; the **Release** workflow also builds `Wedge_<version>_x64.msix` and attaches it to the run as the `wedge-msix` artifact. Locally: `npm run build:msix`.
4. **Packages**: upload the `.msix`. Device family: Desktop.
5. **Properties**: category _Productivity_; privacy policy URL `https://github.com/Regncreative/Wedge/blob/main/PRIVACY.md`.
6. **Age ratings**: answer the questionnaire (no user-to-user content, no purchases, no location).
7. **Store listing** in English and Turkish (texts below), with:
   - Screenshots: at least 1, 4 or more recommended (the app's own, from `tests/e2e/screens.spec.ts`).
   - Store logo: 1:1 box art, [`assets/store/box-art.png`](../assets/store/box-art.png) (2160 × 2160).
   - License terms: MIT, link to [LICENSE](../LICENSE).
8. **Submission options**: paste the `runFullTrust` justification and the notes for certification below.
9. **Every new version**: bump the version, push the tag, upload the new `.msix`. The Store needs a higher version each time.

## Trying the package before submitting

Turn on Developer Mode (_Settings → System → For developers_), build with `npm run build:msix`, quit any running Wedge, then in PowerShell:

```powershell
Add-AppxPackage -Register src-tauri\target\store\package\AppxManifest.xml
```

This installs the unpacked package as it will run from the Store (without the Store's signature). Remove it from _Settings → Apps_ when done.

## runFullTrust justification

> Wedge is a desktop file shelf (Win32, built with Tauri and Rust). It needs full trust to work with files anywhere on the user's disks: it shows files the user drops on its shelves wherever they are, starts drags of those files into other apps, watches the Downloads and Screenshots folders when the user turns that on, and receives files from the user's phone on the local network. It notices that a file drag started anywhere in Windows with an out-of-context WinEvent hook (EVENT_OBJECT_SHOW/HIDE/DESTROY, looking only for the shell's drag image window); it reads no keyboard or mouse input.

## Listing texts

### English

**Short description**
A file shelf on the edge of your screen: start dragging a file and your shelves slide out.

**Description**
Wedge keeps your shelves on the edge of the screen. Start dragging a file from File Explorer, the desktop or a browser and colored shelf tabs slide out; drop it on one. Click a tab and that shelf opens like a drawer, ready to drag files back into any app.

Wedge only remembers where your files are: they stay where they are on disk.

- Shelves on the screen edge that come out the moment you drag a file
- A pocket to collect files from different folders and drag them out together
- Shared shelves: turn a Google Drive, OneDrive or Dropbox folder into a shelf
- Automatic shelves for new downloads and screenshots
- Search inside PDF, Word, Excel and PowerPoint files
- Quick actions: ZIP, convert and shrink images, open all
- Notes, tags, reminders and temporary shelves
- Desktop widgets, dark and light themes, Turkish and English
- No account, no ads, no telemetry

**Features** (one per line in Partner Center)
Shelves that slide out when you start dragging a file
Drawers you pull out by their tab
A pocket for files from different folders
Shared shelves from Google Drive, OneDrive or Dropbox
Search inside documents
Quick actions for images and ZIP files

**Keywords**
file shelf, drag and drop, files, desktop, productivity, shelf, clipboard

### Türkçe

**Kısa açıklama**
Ekranının kenarında bir dosya rafı: bir dosyayı sürüklemeye başla, rafların çıksın.

**Açıklama**
Wedge raflarını ekranın kenarında tutar. Dosya Gezgini'nden, masaüstünden ya da tarayıcıdan bir dosyayı sürüklemeye başla, renkli raf sekmeleri kenardan çıksın; dosyayı birine bırak. Bir sekmeye tıklayınca o raf çekmece gibi açılır, dosyaları istediğin uygulamaya geri sürükleyebilirsin.

Wedge yalnızca dosyalarının nerede olduğunu hatırlar: dosyalar diskte yerinde kalır.

- Dosya sürüklemeye başladığın anda kenardan çıkan raflar
- Farklı klasörlerden dosya toplayıp hepsini birlikte sürükleyebileceğin bir cep
- Paylaşılan raflar: Google Drive, OneDrive veya Dropbox klasörünü rafa dönüştür
- Yeni indirmeler ve ekran görüntüleri için otomatik raflar
- PDF, Word, Excel ve PowerPoint dosyalarının içinde arama
- Hızlı işlemler: ZIP, resim dönüştürme ve küçültme, hepsini açma
- Notlar, etiketler, hatırlatıcılar ve geçici raflar
- Masaüstü bileşenleri, koyu ve açık tema, Türkçe ve İngilizce
- Hesap yok, reklam yok, veri toplama yok

**Özellikler**
Dosya sürüklemeye başlayınca çıkan raflar
Sekmesinden çekilen çekmeceler
Farklı klasörlerden dosyalar için bir cep
Google Drive, OneDrive veya Dropbox'tan paylaşılan raflar
Belgelerin içinde arama
Resimler ve ZIP için hızlı işlemler

**Anahtar kelimeler**
dosya rafı, sürükle bırak, dosya, masaüstü, verimlilik, raf, pano

## Notes for certification

> Wedge is a file shelf that lives on the right edge of the screen; no account or server is needed. After installing, it starts in the system tray and shows a welcome screen. Colored tabs sit at the right screen edge. To try it: drag any file from File Explorer; the tabs slide out; drop the file on a tab. Click a tab to open that shelf as a drawer; Ctrl+Shift+Space also opens it. Drag a card from the drawer into any app to use the file. Right-click a file in File Explorer for "Add to Wedge".
>
> To notice that a file drag started anywhere, Wedge uses an out-of-context WinEvent hook (SetWinEventHook for EVENT_OBJECT_SHOW, HIDE and DESTROY) and only looks for the shell's drag image window (class "SysDragImage"). It reads no keyboard or mouse input and changes no Windows settings.
>
> Starting with Windows (the package's startup task) is only turned on after the user agrees on the welcome screen, and both it and the File Explorer entry can be switched off in Settings. In this build the Store installs updates; Wedge doesn't update itself.
