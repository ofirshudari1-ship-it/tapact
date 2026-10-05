# UPGRADE PLAN - TapAct RTL / Settings / Welcome round

> based on UPGRADE-REPORT 2026-10-05. autonomy: full. branch: `upgrade/2026-10-05-rtl-settings`.
> each sprint = 1+ commits, `npm test` green before each commit, re-run `live-harness/pass.cjs after` at the end.
> no business-logic changes except two bug fixes that make a setting do what its UI says (first-run language, dedupe 0), both with unit tests.
> all new/changed Hebrew: hebrew-copywriting rules (plain, active, regular hyphen only, `←` for arrows, no emoji in new strings, no invented claims). en keys kept in parity.

### S1 - First-run language + welcome window (blockers)
**Scope:** resolve the first-run language after `app.ready` (installer marker > OS locale), only for installs that have not finished/skipped the welcome and never chose a language; move the welcome inline script into `welcome.js`; pass lang/theme/shortcuts to the welcome via query string so dir/lang/theme are set before first paint; rewrite the welcome steps (what it does / copy a phone -> popup -> WhatsApp / history shortcut / where settings live); real logo; dir-aware arrows + slide animation; scrollable step area.
**Contract:**
- [ ] live `first-run-language`: `--lang=he-IL` -> stored `he`; `--lang=en-US` -> stored `en`
- [ ] welcome (first run + reopened) in all 4 configs: `doc.lang`=config lang, `doc.dir`=rtl/ltr, `doc.theme`=config theme, `leaks`=0, console errors 0
- [ ] new unit tests for the language resolver (marker, locale he, locale en, existing install untouched)
- [ ] `npm test` green

### S2 - RTL / bidi in every window
**Scope:** `unicode-bidi: plaintext` for user-authored text (templates, tags, rule labels, lead template/sources, search fields, popup name/role/message, history item text); `dir="ltr"` for LTR values (shortcuts, regex, URL template) aligned to the layout start; shortcut display via a shared `formatAccelerator()` (Ctrl/Win) also used by the tray menu; Hebrew `→` -> `←`; fix physical CSS (`detect.py` high).
**Contract:**
- [ ] `detect.py`: 0 `rtl.physical-css`; the 2 `rtl.physical-class` hits documented in `detect-ignore.json` with reason (English prose "right-click")
- [ ] shortcut inputs: `dir=ltr`, value starts with `Ctrl+`/`Win+`, `scrollWidth <= clientWidth` (browser-after.json fields)
- [ ] template textarea/label computed `unicode-bidi: plaintext` in he and en (browser-after.json) + screenshot `settings-templates__1040x780__en__light.png` shows Hebrew punctuation on the correct side
- [ ] history URL item renders left-to-right (screenshot `clipboard-history__he__*.png`)
- [ ] 0 occurrences of `→` in `STRINGS.he` values (test)

### S3 - Settings: truthful, clear, comfortable
**Scope:** rewrite every hint listed under [High] in the REPORT to match the code; dynamic shortcut tokens in hints; `dedupeSeconds: 0` really means "no cooldown" (helper + test); language buttons without flag emoji; detector select not truncated; remove long dashes from Hebrew strings touched; i18n parity test.
**Contract:**
- [ ] every row of the "setting -> code" table below re-verified and its hint matches
- [ ] `tests/i18n.test.js`: he/en key parity, no empty values, no `—` in he values
- [ ] dedupe helper test: 0 -> 0ms, undefined -> default 10s, 30 -> 30000
- [ ] no `<select>` in Settings with `scrollWidth > clientWidth` (live)

### S4 - A11y + theme polish in the small windows
**Contract:**
- [ ] axe serious/critical = 0 on welcome, popup, action-popup, history in all 4 configs (moderate landmark rules allowed <= 2 per window)
- [ ] `color-scheme` set per theme in Settings (scrollbars follow theme)
- [ ] `[needs-human]` light theme for history + action-popup (new visual design, not a fix) - documented, not done unless time allows

### S5 - Release
- [ ] version 3.9.0 (scope: new welcome + language fix), CHANGELOG/PROJECT updated
- [ ] `npm run dist`, ff master, push branch+master+tag, `gh release create` with exe + blockmap + latest.yml; sha512 in published latest.yml == local exe sha512

## Setting -> code truth table (to verify in S3)
| setting | what the code does | file:line |
|---|---|---|
| startMinimized | only skips the first-run welcome; app always starts in tray | main.js:1733 |
| closeToTray | X hides the window; quitting via tray > Exit | main.js:833, window-behavior.js:20 |
| showTrayNotification | balloon on phone popup + gates one-time tray-hide tip | main.js:431, window-behavior.js:30 |
| soundOnDetect | beep on automatic detection (after quiet-hours check) | main.js:282,292,324 |
| startPaused | each launch sets enabled=false | main.js:1713 |
| trayClickAction | left-click: history/settings/none; right-click always menu | window-behavior.js:46 |
| pollMs | watcher interval, restarts on save | main.js:179, 1339 |
| dedupeSeconds | no repeat popup for the same detected phone/value within N s; 0 currently -> 60 (bug) | main.js:259 |
| autoCloseSeconds | closes popup after N s idle, hover pauses, 0 = never | main.js:633 |
| sendDedupeMinutes | popup warns if this number was sent to within N min, 0 = off | popup.js:59 |
| quietHours | no automatic popup in range; still logged; manual shortcut works | main.js:279,290,305 |
| autoRunAction/delay | runs the first action after N s on action popups (not phone); closing the popup cancels | main.js:649,504 |
| detectors.* | gate automatic popups only; history categorizes regardless | main.js:162 |

## Out of scope (explicit)
- AI layer, lead delivery logic, auto-updater, installer scripts.
- Splitting `main.js`/`settings.js` (> 800 lines) - separate sprint, not this round.
- `{name}` alias for the `{שם}` template token (would change message output) - `[needs-human]`.
- English default templates for English installs (content decision) - `[needs-human]`.

## Final target
Professional on dims 1/3/5/6/8 (>= 8) for the windows in scope, 0 blocker/high in detect, 0 console errors, axe serious = 0.
