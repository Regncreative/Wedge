# winget package

Manifests for publishing Stash to the [Windows Package Manager](https://github.com/microsoft/winget-pkgs), so users can run:

```powershell
winget install Regncreative.Stash
```

## First submission (manual, once)

1. Validate locally:
   ```powershell
   winget validate --manifest packaging/winget/1.0.4
   winget install --manifest packaging/winget/1.0.4   # test install
   ```
2. Fork `microsoft/winget-pkgs`, copy the three files to
   `manifests/r/Regncreative/Stash/1.0.4/`, and open a pull request.

## Later versions

After a release is published, update the package with
[wingetcreate](https://github.com/microsoft/winget-create):

```powershell
wingetcreate update Regncreative.Stash --version 1.1.0 `
  --urls https://github.com/Regncreative/Stash/releases/download/v1.1.0/Stash-Setup-1.1.0.exe `
  --submit
```

Note: unsigned installers are accepted but may be flagged during winget's automated validation. Signing (see the Release workflow) avoids that.
