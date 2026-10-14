; Included by electron-builder's NSIS installer (package.json → build.nsis.include).
; Saved as UTF-8 with BOM so NSIS reads the Turkish text correctly.

!macro customUnInstall
  ; The old uninstaller also runs silently during auto-updates; never touch
  ; user data then. On a real uninstall, ask (silent uninstall keeps data).
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "Stash raflarınız ve ayarlarınız da silinsin mi?$\r$\nDiskteki dosyalarınıza dokunulmaz.$\r$\n$\r$\nAlso delete your Stash shelves and settings?$\r$\nYour files on disk are not touched." \
      /SD IDNO IDNO stash_keep_data
    ; userData lives in the installing user's roaming profile even for
    ; per-machine installs.
    SetShellVarContext current
    RMDir /r "$APPDATA\Stash"
    stash_keep_data:
  ${endIf}
!macroend
