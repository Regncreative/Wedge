# Microsoft Store (MSIX)

Publishing through the Store gives users a Microsoft-signed package (no SmartScreen warning) and Store-managed updates. Individual developer accounts are free to register.

## One-time setup

1. Register at [Partner Center](https://partner.microsoft.com/dashboard/registration) as an individual developer.
2. Reserve the app name **Stash** (or an alternative if it is taken).
3. Under *Product identity*, copy these values:
   - `Package/Identity/Name` → `identityName`
   - `Package/Identity/Publisher` → `publisher` (starts with `CN=`)
   - `Package/Properties/PublisherDisplayName` → `publisherDisplayName`

## Build config

Add this to `build` in `package.json` with the values from Partner Center:

```json
"appx": {
  "identityName": "12345Regncreative.Stash",
  "publisher": "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "publisherDisplayName": "Regncreative",
  "applicationId": "Stash",
  "displayName": "Stash",
  "languages": ["en-US", "tr-TR"]
}
```

Build the package (the Store signs it during certification):

```powershell
npm run build
npx electron-builder --win appx --publish never
```

Upload `release/Stash <version>.appx` in Partner Center.

## Behaviour differences in the Store build

- **Updates:** `process.windowsStore` is true, so the built-in updater is disabled and Settings says updates come from the Store (`src/main/updater.ts`).
- **Start with Windows:** `app.setLoginItemSettings` has no effect in MSIX. Users can enable Stash under *Settings → Apps → Startup*. Supporting the toggle needs an MSIX `StartupTask` extension; add it if Store users ask for it.
