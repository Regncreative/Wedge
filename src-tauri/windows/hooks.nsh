; Hooks for the Tauri NSIS installer (tauri.conf.json → bundle.windows.nsis.installerHooks).

; Stash 1.x was built with electron-builder, whose installer registered
; itself under this GUID (UUID v5 of "com.stash.app").
!define STASH_V1_GUID "ce656aaf-6c5b-5987-8de0-799201da583b"

!macro STASH_REMOVE_V1 ROOT
  ClearErrors
  ReadRegStr $R2 ${ROOT} "Software\${STASH_V1_GUID}" "InstallLocation"
  ${If} $R2 != ""
  ${AndIf} ${FileExists} "$R2\Uninstall Stash.exe"
    DetailPrint "Removing Stash 1.x from $R2"
    ; _?= runs the uninstaller in place so ExecWait really waits for it.
    ; (Not --updated: in that mode it tries to move its own, locked, folder
    ; and aborts.) 1.x never deletes %APPDATA%\Stash, which this version reuses.
    ExecWait '"$R2\Uninstall Stash.exe" /S _?=$R2' $R3
    DetailPrint "Stash 1.x uninstaller exit code: $R3"
    Delete "$R2\Uninstall Stash.exe"
    ; If anything is left, remove it, but only if it really is the Electron app.
    ${If} ${FileExists} "$R2\LICENSE.electron.txt"
      RMDir /r "$R2"
    ${EndIf}
    RMDir "$R2"
    DeleteRegKey ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${STASH_V1_GUID}"
    DeleteRegKey ${ROOT} "Software\${STASH_V1_GUID}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro STASH_REMOVE_V1 HKCU
  !insertmacro STASH_REMOVE_V1 HKLM
  ; 1.x's "start with Windows" entry (Electron names it after the AppUserModelID).
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.stash.app"
  ; 1.x's Start menu shortcut, if its uninstaller left it behind.
  Delete "$SMPROGRAMS\Stash.lnk"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Stash 1.x's updater (electron-updater) installs this version silently with
  ; --force-run and expects the installer to start the app afterwards.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--force-run" $R1
  ${IfNot} ${Errors}
    Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Explorer's "Add to Stash" entry points at this install; remove it on a
  ; real uninstall (an update re-registers it on the next start).
  ${If} $UpdateMode <> 1
    DeleteRegKey HKCU "Software\Classes\*\shell\Stash"
    DeleteRegKey HKCU "Software\Classes\Directory\shell\Stash"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; The uninstaller's "Delete the application data" checkbox clears Tauri's
  ; own folders; shelves and settings live in %APPDATA%\Stash (shared with
  ; 1.x), so clear that too. Never during an update.
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    RMDir /r "$APPDATA\Stash"
  ${EndIf}
!macroend
