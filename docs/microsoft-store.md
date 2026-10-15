# Publishing Wedge in the Microsoft Store

Wedge goes into the Store as an **EXE app**: Partner Center links to the installer on GitHub Releases, and Wedge keeps updating itself from there (allowed for EXE apps). Requirements below are from the [Microsoft Store Policies](https://learn.microsoft.com/windows/apps/publish/store-policies) (version 7.20) and the [EXE/MSI submission checklist](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msi/create-app-submission).

## Where Wedge stands

| Requirement                                                                                                                        | Policy         | Status                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Installer is an `.exe` or `.msi`                                                                                                   | 10.2.9         | Done: the NSIS installer `Wedge_<version>_x64-setup.exe`                                                                |
| Installer **and every `.exe`/`.dll` in it** signed with a code-signing certificate from a CA in the Microsoft Trusted Root Program | 10.2.9         | **Missing**: see [Code signing](#code-signing)                                                                          |
| Versioned HTTPS download URL whose file never changes                                                                              | 10.2.9         | Done: GitHub release assets live under the version tag                                                                  |
| Silent install, no installer UI (UAC allowed)                                                                                      | 10.2.9         | Done: `/S`                                                                                                              |
| Standalone installer, not a downloader                                                                                             | 10.2.9         | Done with `npm run build:store`, which puts WebView2 inside the installer (the regular build downloads it if missing)   |
| Clean uninstall                                                                                                                    | 10.2.7         | Done: the uninstaller removes the File Explorer entry and the start-up entry, and offers to delete shelves and settings |
| Ask before changing the user's Windows                                                                                             | 10.2.8         | Done: starting with Windows and the File Explorer entry are offered on the welcome screen                               |
| Responsive, no crashes                                                                                                             | 10.4.2         | Done: drags and slow file work stay off the UI thread; a watchdog logs any freeze                                       |
| Privacy policy                                                                                                                     | 10.5.1         | Done: [PRIVACY.md](../PRIVACY.md); give its URL in Partner Center                                                       |
| Publisher name differs from product name                                                                                           | Partner Center | Done: Regncreative / Wedge                                                                                              |

## Code signing

This is the one thing left. The certificate must chain to the [Microsoft Trusted Root Program](https://learn.microsoft.com/security/trusted-root/participants-list), and it signs `wedge.exe`, the uninstaller and the installer. Options:

- **Certum Open Source Code Signing**: low-cost certificates for open-source developers, individuals included, with cloud signing (SimplySign).
- **SignPath Foundation**: free signing for open-source projects, done in CI; the certificate is issued to SignPath Foundation.
- **Microsoft's signing service (Azure Trusted Signing)**: cheap per month and signs in CI, but check whether individuals in your country can use it.
- **A commercial OV certificate** (Sectigo, DigiCert, SSL.com…) on a hardware token or cloud HSM.

Once there is a certificate, set `bundle.windows.signCommand` (or `certificateThumbprint`) in `src-tauri/tauri.conf.json` and fill in the "Code signing" step in `.github/workflows/release.yml`. Signing also ends the SmartScreen warning for everyone downloading from GitHub.

## Steps

1. **Partner Center**: enroll as an individual developer and reserve the name **Wedge** (_Apps and games → New product → EXE or MSI app_). If the name is taken, the reservation tells you.
2. **Sign** the builds (above).
3. **Build the Store installer**: `npm run build:store`. It is bigger than the regular one (WebView2 is inside). Upload it to the version's GitHub release as `Wedge_<version>_x64-store-setup.exe`.
4. **Packages**:
   - Package URL: `https://github.com/Regncreative/Wedge/releases/download/v<version>/Wedge_<version>_x64-store-setup.exe`
   - Architecture: x64
   - Installer parameters: `/S`
   - Languages: English, Turkish
   - App type: EXE
5. **Properties**: category _Productivity_. Wedge collects no personal information; still give the privacy policy URL: `https://github.com/Regncreative/Wedge/blob/main/PRIVACY.md`.
6. **Age ratings**: answer the questionnaire (no user-to-user content, no purchases, no location).
7. **Store listing** in English and Turkish (texts below), with:
   - Screenshots: at least 1, 4 or more recommended, PNG.
   - Store logo: 1:1 box art, [`assets/store/box-art.png`](../assets/store/box-art.png) (2160 × 2160).
   - License terms: MIT, link to [LICENSE](../LICENSE).
8. **Notes for certification**: paste the text below.
9. **Every new version**: upload its Store installer to the release and enter the new versioned URL in Partner Center.

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

> Wedge is a file shelf that lives on the right edge of the screen; no account or server is needed. After installing, it starts in the system tray and shows a welcome screen. Colored tabs sit at the right screen edge. To try it: drag any file from File Explorer; the tabs slide out; drop the file on a tab. Click a tab to open that shelf as a drawer; Ctrl+Shift+Space also opens it. Drag a card from the drawer into any app to use the file.
>
> To notice that a file drag started anywhere, Wedge uses an out-of-context WinEvent hook (SetWinEventHook for EVENT_OBJECT_SHOW, HIDE and DESTROY) and only looks for the shell's drag image window (class "SysDragImage"). It reads no keyboard or mouse input and changes no Windows settings.
>
> Starting with Windows and the "Add to Wedge" File Explorer entry are only added after the user agrees on the welcome screen; both can be turned off in Settings, and the uninstaller removes them. Wedge updates itself from GitHub Releases and verifies each update's signature before installing it.
