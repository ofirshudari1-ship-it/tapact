# EVAL v3.10.0 (independent, 2026-10-06)

Method: real `desktop-agent` source (electron.exe from node_modules), `--user-data-dir` = new temp profile, `--remote-debugging-port=9555`, Node inspector used only to no-op `setLoginItemSettings` (its default value name = the installed app's registry entry) and record global-shortcut callbacks instead of grabbing them OS-wide. Clipboard = REAL (PowerShell Set-Clipboard), cursor = REAL (SetCursorPos). Harness: scratchpad `ev/` (evlib.cjs, runA.cjs, runB.cjs, burst.cjs). Display: primary 2048x1152 DIP @125% (work area 2048x1104), second 1920x1080 @100% at x=2048.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | No Windows notification on copy | PASS | grep: no `new Notification`/`checkForUpdatesAndNotify` call; 0 balloons over ~120 copies; old toggles absent from settings.html + i18n. Note: `tray.displayBalloon` still exists (main.js:1064, one-time hint on first hide-to-tray, not on copy) |
| 2 | Smart triggering | PASS | phone-only -> popup, unfocused; 319-char paragraph w/ phone -> 0 popups, +1 history; history-row click (real UI) -> clipboard set, 0 popups; Settings focused -> 0 popups; `123456782` -> 0; 5 numbers/15s -> 3 popups, all 5 logged |
| 3 | Auto-dismiss | PASS | closed at 7.05s untouched; bar 3px, opacity 1, animating; held >10s by real-cursor hover, More options, focused field, snooze menu (phone + action); closes 7.1s after hover leaves |
| 4 | Close + snooze | PASS | X closes both popups; menu items 15m/1h/tomorrow 08:00/stop-type/back in both; 15m=15.000 min, 1h ok, tomorrow = 07/10 08:00; snoozed -> no auto popup, history +1, shortcut + tray manual open work; tray "מושהה עד HH:MM", Settings General status; survives restart; phone/url type-off works, phone re-enabled via Settings Detectors + Save |
| 5 | Placement | PASS | 10 positions (4 corners, center, on taskbar, near taskbar, left edge, display-2 center/bottom-right): gap 13-14px (on-taskbar 42px, clamped to work-area edge), always inside work area, never covers cursor; cursor moved away 100/250ms after copy -> popup at copy point (gap 14) |
| 6 | Themes + axe | PASS | action popup + history, he/en x light/dark: serious/critical = 0; light bg rgb(243,244,250), dark rgb(30,34,43) |
| 7 | Settings | PASS | General: 1 Save (`saveSettingsBtn`), `#generalDirty` shows on change, no "minimized" text; he/en keys 425/425, 0 missing/empty; he dir=rtl, rules/templates strings direction rtl |
| 8 | Templates | PASS | en UI + untouched he defaults -> English set; customized set byte-identical; `{name}` and `{שם}` both fill |
| 9 | Robustness | PASS | 40 copies in 2.7s: process alive, 0 uncaught, 0 dialogs; detects again after burst pause |
| 10 | Release | PASS | v3.10.0 published (not draft): exe 112,262,503 B + blockmap + latest.yml; sha512 of the downloaded exe = latest.yml (both fields), size matches; tag = HEAD d07cdd1; `npm test` 238/238 (13 suites) |

## Annoyances not on the owner's list
1. Zero-padded 9-digit ID `034567891` DOES open a WhatsApp popup (looks like landline 03-4567891). Older Israeli IDs start with 0, so a rep copying an ID can still get a popup.
2. Rapid copies: 40 clipboard changes in 2.7s -> only 8 in history (400ms polling misses intermediate copies). Fine for people, but history is not a full log.
3. The INSTALLED app on this PC is still 3.8.4 (elevated). During testing it showed its own "Error" dialog (title "Error", button "אישור"), the old bug. Because it is elevated, it also blocks SetCursorPos while in front. v3.10 has not reached this machine yet.
4. Over the taskbar the gap is 42px, because the anchor is clamped to the work-area edge. Acceptable.

## Verdict: DONE
No FAIL among items 1-10. Recommended follow-ups (not blockers): zero-padded ID false positive; install 3.10.0 on this PC (3.8.4 is still running and showing an error dialog).
