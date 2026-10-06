; ============================================================
; TapAct — Custom NSIS Installer Script
; Modern wizard with full options
;
; Bilingual (English default, Hebrew via the language selector - see
; "installerLanguages"/"displayLanguageSelector" in package.json). Every
; user-facing string here goes through LangString so it actually follows
; whichever language the user picks in the selector.
;
; Language IDs: 1033 = English, 1037 = Hebrew
; (Using numeric IDs because ${LANG_*} constants are not available
;  at include-time when displayLanguageSelector is true.)
; ============================================================

!ifndef BUILD_UNINSTALLER

  ; ── Bilingual strings ──────────────────────────────────────
  LangString WelcomeTitle 1033 "Welcome to the TapAct $(^Version) Setup Wizard"
  LangString WelcomeTitle 1037 "ברוכים הבאים ל-TapAct $(^Version)"

  LangString WelcomeText 1033 "This wizard will guide you through installing TapAct — the smart clipboard agent.$\r$\n$\r$\nTapAct runs quietly in the System Tray and watches your clipboard: copy a phone number and it offers a one-click WhatsApp message, copy a tracking number and it opens the carrier's tracking page, copy an address and it offers Maps/Waze, copy a link and it offers to open it. Everything you copy is also kept in a searchable clipboard history (like Windows' own Win+V), all stored locally on this PC.$\r$\n$\r$\nIt's recommended to close all open applications before continuing.$\r$\n$\r$\nClick Next to continue."
  LangString WelcomeText 1037 "אשף זה ידריך אותך בהתקנת TapAct — סוכן לוח ההעתקה החכם.$\r$\n$\r$\nTapAct רץ בשקט במגש המערכת ועוקב אחרי מה שאתה מעתיק: מספר טלפון מקבל הצעה לשליחת הודעת WhatsApp בלחיצה אחת, מספר מעקב פותח את דף המעקב של חברת השילוח, כתובת מקבלת הצעה לניווט ב-Maps/Waze, וקישור מקבל הצעה לפתיחה. כל מה שהעתקת נשמר גם בהיסטוריית לוח העתקה ניתנת לחיפוש (בדומה ל-Win+V של Windows), הכול נשמר מקומית על המחשב הזה.$\r$\n$\r$\nמומלץ לסגור את כל האפליקציות הפתוחות לפני שתמשיך.$\r$\n$\r$\nלחץ הבא כדי להמשיך."

  LangString FinishTitle 1033 "Setup completed successfully!"
  LangString FinishTitle 1037 "ההתקנה הושלמה בהצלחה!"

  LangString FinishText 1033 "TapAct has been installed successfully.$\r$\n$\r$\nYou can open it from the System Tray, in the bottom-right corner.$\r$\n$\r$\nClick Finish to close this wizard."
  LangString FinishText 1037 "TapAct הותקן בהצלחה.$\r$\n$\r$\nניתן לפתוח אותו ממגש המערכת (System Tray) בפינה הימנית התחתונה.$\r$\n$\r$\nלחץ סיום להשלמת ההתקנה."

  LangString FinishRunText 1033 "Launch TapAct now"
  LangString FinishRunText 1037 "הפעל את TapAct עכשיו"

  LangString UpdatedMsg 1033 "TapAct updated successfully from version $ExistingVersion to ${VERSION}"
  LangString UpdatedMsg 1037 "TapAct עודכן בהצלחה מגרסה $ExistingVersion לגרסה ${VERSION}"

  LangString InstalledMsg 1033 "TapAct ${VERSION} installed successfully to $INSTDIR"
  LangString InstalledMsg 1037 "TapAct ${VERSION} הותקן בהצלחה ב-$INSTDIR"

  LangString UninstallComment 1033 "Smart clipboard agent — phone, address, tracking, links"
  LangString UninstallComment 1037 "סוכן לוח ההעתקה החכם — טלפון, כתובת, מעקב, קישורים"

  ; ActionClip 2.x (the previous name of this app) is still installed. Both apps watch the clipboard,
  ; so running both shows two popups for every copy and one of them loses the Win+V shortcut.
  LangString ActionClipFoundText 1033 "The older app ActionClip is installed on this PC. ActionClip and TapAct both watch the clipboard, so running both shows two popups for every copy.$\r$\n$\r$\nUninstall ActionClip now? Your ActionClip data is not deleted.$\r$\n$\r$\nChoose No to keep both and uninstall ActionClip yourself later."
  LangString ActionClipFoundText 1037 "האפליקציה הישנה ActionClip מותקנת במחשב הזה. ActionClip ו-TapAct עוקבים שניהם אחרי הלוח, ולכן כששניהם רצים כל העתקה פותחת שתי חלוניות.$\r$\n$\r$\nלהסיר את ActionClip עכשיו? הנתונים של ActionClip לא נמחקים.$\r$\n$\r$\nבחרו לא כדי להשאיר את שניהם ולהסיר את ActionClip בעצמכם בהמשך."

  ; NOTE: electron-builder's base template already calls CHECK_APP_RUNNING
  ; automatically for every NSIS installer, which detects a running
  ; TapAct.exe, offers to close it, and retries. No custom check needed.

  ; ── Variables ──────────────────────────────────────────────
  !macro customHeader
    Var UpdateMode
    Var ExistingVersion
    Var AddDesktopShortcut
    Var AddStartupLaunch
  !macroend

  ; ── Find an installed ActionClip (the app's name up to 2.x) ──
  ; Scans the Uninstall keys of HKLM and HKCU for DisplayName "ActionClip" and leaves its quiet
  ; uninstall command in $ActionClipUninstall ("" when not installed).
  Var ActionClipUninstall
  Function TapActFindActionClip
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    StrCpy $ActionClipUninstall ""
    StrCpy $R0 0
    tapactScanLM:
      EnumRegKey $R1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
      StrCmp $R1 "" tapactScanLMDone
      IntOp $R0 $R0 + 1
      ReadRegStr $R2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
      StrCmp $R2 "ActionClip" 0 tapactScanLM
      ReadRegStr $R3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "QuietUninstallString"
      StrCmp $R3 "" 0 tapactFound
      ReadRegStr $R3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "UninstallString"
      StrCmp $R3 "" tapactScanLM
      StrCpy $R3 "$R3 /S"
      Goto tapactFound
    tapactScanLMDone:
    StrCpy $R0 0
    tapactScanCU:
      EnumRegKey $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
      StrCmp $R1 "" tapactNone
      IntOp $R0 $R0 + 1
      ReadRegStr $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
      StrCmp $R2 "ActionClip" 0 tapactScanCU
      ReadRegStr $R3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "QuietUninstallString"
      StrCmp $R3 "" 0 tapactFound
      ReadRegStr $R3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "UninstallString"
      StrCmp $R3 "" tapactScanCU
      StrCpy $R3 "$R3 /S"
    tapactFound:
      StrCpy $ActionClipUninstall $R3
    tapactNone:
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd

  ; ── Detect existing installation ────────────────────────────
  !macro customInit
    ; Check for existing install (HKLM first, then HKCU).
    ; ${UNINSTALL_APP_KEY} is electron-builder's real Add/Remove Programs key
    ; (a GUID derived from appId). This used to read "${APP_ID}_is1" - an
    ; Inno Setup naming convention electron-builder never writes - so an
    ; existing install was never detected and UpdateMode was always "0".
    ReadRegStr $ExistingVersion HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
    ${If} $ExistingVersion == ""
      ReadRegStr $ExistingVersion HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion"
    ${EndIf}

    ${If} $ExistingVersion != ""
      StrCpy $UpdateMode "1"
    ${Else}
      StrCpy $UpdateMode "0"
    ${EndIf}

    ; Default checkbox values
    StrCpy $AddDesktopShortcut "1"
    StrCpy $AddStartupLaunch "0"

    ; ── Hand the installer's language choice to the app ────────
    ; By the time customInit runs, MUI_LANGDLL_DISPLAY (electron-builder's
    ; own installer.nsi, called from .onInit before customInit) has already
    ; set $LANGUAGE from the language selector - 1033 English, 1037 Hebrew
    ; (same IDs as the LangString entries above). There is no NSIS-to-app
    ; channel other than the filesystem, and the app's own settings store
    ; (electron-store, see src/lib/store.js) lives at
    ; $APPDATA\TapAct\tapact.json (app.setName('TapAct') in main.js), so we
    ; drop a tiny marker file next to it instead of trying to hand-assemble
    ; that JSON's exact shape from NSIS. src/main.js consumes it once on
    ; first launch, then deletes it; app.getLocale() remains the fallback
    ; if the marker is ever missing.
    ;
    ; Only on a genuinely fresh install: if tapact.json already exists, a
    ; real user preference may already be saved there, and store.js's own
    ; merge logic (saved settings always win over defaults) would ignore
    ; this marker anyway - but we skip writing it at all so an update/
    ; reinstall never even risks it, and so a Repair/re-run of the same
    ; installer doesn't stomp a language the user later picked in Settings.
    ;
    ; PER-MACHINE INSTALL: electron-builder runs SetShellVarContext all before customInit, and in that
    ; context $APPDATA is C:\ProgramData - but the app reads the signed-in user's own
    ; %APPDATA%\TapAct (Electron always uses per-user app data). So the marker is written with the
    ; "current" shell context and the previous context is restored afterwards.
    SetShellVarContext current
    ${IfNot} ${FileExists} "$APPDATA\TapAct\tapact.json"
      CreateDirectory "$APPDATA\TapAct"
      ${If} $LANGUAGE == 1037
        FileOpen $9 "$APPDATA\TapAct\first-run-language.txt" w
        FileWrite $9 "he"
        FileClose $9
      ${Else}
        FileOpen $9 "$APPDATA\TapAct\first-run-language.txt" w
        FileWrite $9 "en"
        FileClose $9
      ${EndIf}
    ${EndIf}
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}

    ; ── ActionClip 2.x coexistence ──────────────────────────────
    ; Only on a fresh install (an existing TapAct means the user already decided), never in a silent
    ; install/auto-update, default answer No, and never blocks the install whatever happens.
    ${If} $UpdateMode == "0"
    ${AndIfNot} ${Silent}
      Call TapActFindActionClip
      ${If} $ActionClipUninstall != ""
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(ActionClipFoundText)" IDYES tapactRemoveActionClip IDNO tapactKeepActionClip
        tapactRemoveActionClip:
          nsExec::Exec 'taskkill /F /IM ActionClip.exe'
          Pop $0
          ClearErrors
          ExecWait '$ActionClipUninstall' $0
          ClearErrors
        tapactKeepActionClip:
      ${EndIf}
    ${EndIf}
  !macroend

  ; ── Shared cross-product brand-color button styling ──────────
  ; STANDARDS.md §21 — unified installer palette (IObit-style): OptiGuard,
  ; Playnest, TapAct and SnapCap all use the same accent blue in their
  ; installer wizard so the four tools read as one company's suite. This
  ; replaces TapAct's own former brand indigo (#595CD9) in the installer
  ; only — the running app itself is untouched.
  ;
  ; MUI2 has no supported hook to reshape/recolor a standard Next/Back/
  ; Cancel button — the theme engine (uxtheme) draws them. The one real
  ; technique: switch a specific button handle off Windows visual-style
  ; theming (uxtheme::SetWindowTheme, via NSIS's bundled System plugin),
  ; which makes SetCtlColors actually take effect. Real, visible result:
  ; the Next/primary button loses the native rounded Windows chrome and
  ; renders flat/classic in the brand color — not a shaped custom bitmap
  ; button. Cancel is left native/themed on purpose.
  ;
  ; Shared accent #2F6FED against white button text is 4.9:1 — passes
  ; WCAG AA for normal text (per STANDARDS.md §21.1, already audited there).
  Function ColorPrimaryButton
    GetDlgItem $0 $HWNDPARENT 1 ; Next / Install / Finish
    System::Call 'uxtheme::SetWindowTheme(i r0, w "", w "") i .r1'
    SetCtlColors $0 0xFFFFFF 0x2F6FED
  FunctionEnd

  ; ── Welcome page customization ─────────────────────────────
  !macro customWelcomePage
    !define MUI_WELCOMEPAGE_TITLE "$(WelcomeTitle)"
    !define MUI_WELCOMEPAGE_TEXT "$(WelcomeText)"
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW ColorPrimaryButton
    !insertmacro MUI_PAGE_WELCOME
  !macroend

  ; ── Finish page: add extra checkboxes ──────────────────────
  !macro customFinishPage
    !define MUI_FINISHPAGE_TITLE "$(FinishTitle)"
    !define MUI_FINISHPAGE_TEXT "$(FinishText)$\r$\n$\r$\n© 2024–2026 TapAct. All rights reserved."
    ; ${APP_EXECUTABLE_FILENAME} = TapAct.exe. (${APP_FILENAME} is
    ; electron-builder's install-DIRECTORY name, not the exe.)
    !define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    !define MUI_FINISHPAGE_RUN_TEXT "$(FinishRunText)"
    !define MUI_FINISHPAGE_SHOWREADME ""
    !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW ColorPrimaryButton
    !insertmacro MUI_PAGE_FINISH
  !macroend

  ; ── Post-install tasks ──────────────────────────────────────
  !macro customInstall
    ; Write version to registry for future update detection
    WriteRegStr SHCTX "Software\TapAct" "Version" "${VERSION}"
    WriteRegStr SHCTX "Software\TapAct" "InstallDir" "$INSTDIR"

    ; Extra Add/Remove Programs metadata, written to electron-builder's REAL
    ; uninstall key (${UNINSTALL_APP_KEY}; it already writes DisplayIcon and
    ; Publisher there itself), which its own uninstaller removes. Previously
    ; all of this went to "Uninstall\${APP_ID}_is1" - a key nothing read or
    ; deleted, so every install left it behind as registry residue (§11.5).
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}_is1" ; legacy key from <= 2.7.4

    WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "HelpLink" "https://tapact.app"

    WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "URLInfoAbout" "https://tapact.app"

    WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
      "Comments" "$(UninstallComment)"

    ; Inbound firewall rule: TapAct opens no listening socket (it only makes outbound requests), so no
    ; rule is needed and none is added any more. Versions up to 3.11 added one; remove it so updating
    ; cleans it up.
    nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="TapAct"'
    Pop $0

    ${If} $UpdateMode == "1"
      DetailPrint "$(UpdatedMsg)"
    ${Else}
      DetailPrint "$(InstalledMsg)"
    ${EndIf}
  !macroend

!endif

; ── Uninstall: clean registry and firewall rule ───────────────────
; Deliberately OUTSIDE the `!ifndef BUILD_UNINSTALLER` block above.
; electron-builder compiles the uninstaller in a separate makensis pass with
; BUILD_UNINSTALLER defined (its templates/nsis/installer.nsi only includes
; uninstaller.nsh - the only caller of customUnInstall - in that pass). While
; this macro lived inside the block it was never defined in the pass that
; actually builds the uninstaller, so uninstalling never removed
; HKxx\Software\TapAct or the firewall rule.
LangString UninstalledMsg 1033 "TapAct removed. Settings were kept in AppData."
LangString UninstalledMsg 1037 "הוסר TapAct. הגדרות נשמרו ב-AppData."

; Uninstall-time data prompt (STANDARDS.md uninstall-UX). Defaults to NOT
; deleting: MB_DEFBUTTON2 makes "No" the pre-selected/focused button, so
; pressing Enter without reading keeps the user's data - matching
; deleteAppDataOnUninstall: false in package.json.
LangString UninstallConfirmText 1033 "Do you also want to delete your TapAct settings, templates, clipboard history and send history? This cannot be undone.$\r$\n$\r$\nChoose No to keep your data (recommended if you plan to reinstall)."
LangString UninstallConfirmText 1037 "למחוק גם את ההגדרות, תבניות ההודעה, היסטוריית ההעתקות והיסטוריית השליחות של TapAct? לא ניתן לבטל פעולה זו.$\r$\n$\r$\nבחר לא כדי לשמור על הנתונים (מומלץ אם מתכננים להתקין מחדש)."

LangString UninstalledDataDeletedMsg 1033 "TapAct removed. Settings and history were deleted."
LangString UninstalledDataDeletedMsg 1037 "הוסר TapAct. ההגדרות וההיסטוריה נמחקו."

!macro customUnInstall
  ; An upgrade (and every silent auto-update) runs the OLD uninstaller with --updated (and /S): it must
  ; not ask anything and must not delete anything - the new version is installed straight afterwards.
  ${ifNot} ${isUpdated}
    DeleteRegKey SHCTX "Software\TapAct"
    ; Legacy uninstall-metadata key written by versions up to 2.7.4.
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}_is1"
    ; Remove firewall rule(s) added by versions up to 3.11
    nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="TapAct"'
    Pop $0
    ; The "Start with Windows" entry Electron writes for the user running the uninstaller.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TapAct"

    ; Ask whether to also delete user data (settings/templates/history), kept in the signed-in
    ; user's %APPDATA%\TapAct via electron-store. Default answer is No, and a silent uninstall
    ; (/S) never deletes data.
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(UninstallConfirmText)" IDYES deleteUserData IDNO keepUserData
      deleteUserData:
        ; Per-machine uninstall runs with SetShellVarContext all ($APPDATA = C:\ProgramData): the data
        ; lives in the real user's roaming profile, so switch to "current" for the delete.
        SetShellVarContext current
        RMDir /r "$APPDATA\TapAct"
        ${If} $installMode == "all"
          SetShellVarContext all
        ${EndIf}
        DetailPrint "$(UninstalledDataDeletedMsg)"
        Goto uninstallDataDone
      keepUserData:
        ; AppData settings preserved so user keeps config on reinstall
        DetailPrint "$(UninstalledMsg)"
      uninstallDataDone:
    ${Else}
      DetailPrint "$(UninstalledMsg)"
    ${EndIf}
  ${endIf}
!macroend
