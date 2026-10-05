# UPGRADE REPORT - TapAct desktop agent (v3.8.5 -> RTL / Settings / Welcome round)

> date: 2026-10-05 · stack: Electron 44, vanilla HTML/CSS/JS renderers, jest · mode: product · autonomy: full
> branch: `upgrade/2026-10-05-rtl-settings` (from master `82401cf`, clean tree; only pre-existing untracked: `.claude/upgrade/a11y-after-v34-he-dark.json`, `desktop-agent/eval-screens/` - left alone)
> ran: detect.py yes (`detect.json`) · live app yes (REAL `src/main.js`, see harness below) · axe yes (axe-core 4.x injected per window) · tests yes (164/164) · no lint/tsc configured in this project
> project rules: `_AUDIT/STANDARDS.md` §14.3/§18.1/§18.2/§20.1/§20.5, `assets/BRAND.md`, `CLAUDE BOTS/CLAUDE.md` (Hebrew copy via hebrew-copywriting)
> previous round (2026-09-24, Settings sizing/a11y) archived to `archive-2026-09-24/`.

## Live harness (how the evidence was produced)
`live-harness/lib.cjs` + `pass.cjs`: spawns `electron.exe --inspect-brk --remote-debugging-port --lang=<he-IL|en-US> .` on the real source.
While paused on line 1 it patches Electron so the run cannot touch the machine: `userData` -> temp dir, login item no-op, clipboard
in-memory (`global.__clip`), `shell.openExternal` recorded, global shortcuts recorded (never grabbed), `show/focus` -> `showInactive`.
Windows are opened through real code paths: first-run (fresh store) -> splash+welcome; tray menu item -> welcome again; `second-instance` -> Settings;
recorded Ctrl+Alt+V callback -> history; setting `__clip` -> the real clipboard watcher opens popup / action-popup.
4 configs (he/en x dark/light) x 9 window states, Settings at 1040x780 (10 tabs + full-length capture) and 860x620 (min size, 3 tabs).
Output: `browser-before.json` (lang/dir/theme per window, leak check against the real i18n tables, fields with dir/align, overflow, axe, console).
Screenshots: `screenshots/before/<window>__<lang>__<theme>.png` (128 files).

## Baseline scores (before)

| # | dimension | score | key evidence |
|---|---|---|---|
| 1 | RTL & Hebrew | 3 | Welcome renders `lang=en dir=ltr` in ALL 4 configs (`browser-before.json` welcome-*: doc.dir=ltr); shortcut values clipped to `ommandOrControl+Alt+P` in RTL (`settings-shortcuts__1040x780__he__dark.png`); Hebrew templates in EN UI rendered as LTR paragraphs, periods/question marks on the wrong side (`settings-templates__1040x780__en__light.png`); URL in history flipped `id=12?מאמר/https://example.com/he` (`clipboard-history__he__light.png`); Hebrew detector hints use `→` which points backwards in RTL (`i18n-renderer.js` detectors.*.desc) |
| 2 | Responsive (window sizes) | 5 | Welcome step 1 footer text overlaps the nav footer (`welcome-firstrun-step1__en__light.png`); detector action `<select>` text truncated `(ברירת מחו` (`settings-detectors__1040x780__he__light__full.png`); 860x620 Settings otherwise OK |
| 3 | Accessibility | 6 | Settings: axe 0 on 10 tabs x 4 configs. Popups/welcome/history: color-contrast serious (action-popup `.btn/.primary`, history `.active`, popup light channel buttons, welcome footer `#666`), landmark-one-main/region, history `nested-interactive` x3 |
| 4 | Design & brand | 5 | Welcome `data-theme` never set -> light theme impossible (`welcome-firstrun-*__light.png` is dark); history + action-popup have no light theme CSS at all (grep `data-theme` = 0 in their css); language buttons show `IL עברית` / `us English` (flag emoji not rendered on Windows); light scrollbar gutter in dark Settings |
| 5 | UX flows & states | 5 | Welcome: mixed languages ("Next →" English next to Hebrew text), no concrete "copy -> popup -> WhatsApp" walk-through, says right-click opens Settings (right-click opens a menu; left-click opens history by default `window-behavior.js:46`) |
| 6 | Forms | 5 | `dedupeSeconds: 0` silently becomes 60s (`main.js:259` `|| 60`) while the input allows 0; 3 different save buttons on one tab; shortcut field shows raw `CommandOrControl` |
| 7 | Perceived performance | 6 | Welcome: 1 console error per load (CSP blocks the inline `<script>` at `welcome.html:95`); all other windows 0 console errors |
| 8 | Ease of setup | 4 | First-run language wrong: `--lang=he-IL` -> `app.getLocale()='he'` but stored `language='en'` (`browser-before.json` first-run-language; cause `store.js:174` resolves at require time, before `app.ready`); misleading hints (below) |
| 9 | AI layer | ❓ | Lead AI cleanup exists (Leads tab) but out of this round's scope; not evaluated |
| 10 | UI code health | 5 | `main.js` 1749, `settings.js` 1435, `settings.html` 802 lines; dead inline script; no i18n parity test; 164 tests pass |

**detect.json (before):** blocker 0 · high 7 (`rtl.physical-css` 5, `rtl.physical-class` 2 - the 2 class hits are false positives on the word "right-click" in strings) · medium 9 · low 16.
**browser-before.json:** 92 rows · console errors: welcome 1/load (CSP) · axe: Settings 0, welcome 6, history 8, popup 6-9, action-popup 4 · leaks: welcome he 2 (`Next →`, `Theme`), welcome en 6-16 (all Hebrew), Settings en: `ערכת נושא / Theme` tooltip.

## Findings by severity

### [Blocker]
- `lib/store.js:174` - default language computed at module load (pre-ready) -> `app.getLocale()` is not ready -> every fresh Hebrew-Windows install starts in English (live: locale `he`, stored `en`).
- `welcome/welcome.html:95` - inline script blocked by the page's own CSP (`script-src 'self'`) -> welcome never applies language/theme: always `dir=ltr`, Hebrew markup text, `Next →`/`✓ Done` from JS in English, theme toggle and language toggle dead.

### [High]
- `settings/settings.html:439-449` shortcut inputs inherit RTL; long accelerator scrolls and clips its start; raw `CommandOrControl`/`Super` shown instead of Ctrl/Win.
- Template label/textarea, tag/rule labels, lead template, sources, search, popup name/role/message: no bidi handling -> Hebrew text in EN UI and Latin text in HE UI render with misplaced punctuation (`settings-templates__1040x780__en__light.png`).
- `clipboard-history.js:260` item text has no bidi isolation -> URLs reorder in RTL.
- `i18n-renderer.js` Hebrew `detectors.*.desc` and others use `→` (backwards in RTL); welcome buttons `← הקודם` / `הבא →` point the wrong way in RTL.
- Misleading/false explanations (verified against code):
  - `settings.startMinimized.sub` "opens directly to tray without a window" - the app always starts in the tray; the flag only skips the first-run welcome (`main.js:1733`).
  - `settings.autoRun.sub` "Escape cancels" - automatic popups are shown without focus since v3.8.5 (`openActionPopupWindow(takeFocus=false)`), so Escape never reaches them; closing the popup cancels (`main.js:504` clearAutoRunTimer on close).
  - `settings.actions.sub` "a preferred action set above" - preferences live in the Detection Types tab.
  - `settings.dedupe.hint` "the exact same copy" - suppression is per detected value (normalized phone / action type+raw), and 0 does not disable (bug above).
  - `settings.notifications.sub` omits that the same toggle also gates the one-time "still running in the tray" tip (`window-behavior.js:30`).
  - `settings.quietHours.sub`, `settings.manual.hint`, `clip.winv.fallback` hardcode `Ctrl+Alt+P` / `Ctrl+Alt+V` although shortcuts are configurable.
  - `welcome.step3.body` "right-click opens settings"; `welcome.step3.footer` "no data leaves your computer" - false when lead webhook/Slack/email or AI cleanup are turned on.

### [Medium]
- Welcome step 1 footer text clipped behind the nav footer (fixed 480x560 window, no scroll).
- `settings.html:350-351` flag emoji render as letters on Windows.
- Detector action `<select>` truncated.
- `welcome.css:137-138` slide animations use physical translateX in both directions.
- History/action-popup: dark only; no `color-scheme` -> native scrollbars light in dark Settings.
- Contrast: action-popup primary button, history active chip, popup light channel buttons, welcome footer.
- `ux.alert-confirm` `settings.js:1071` native confirm for template reset (works, not styled).

### [Nit]
- `settings.css:757` `left:0;right:0` -> `inset-inline:0`; `action-popup.css:118`, `popup.css:153`, `settings.css:834` `text-align:left` on LTR-isolated values.
- Hebrew strings contain long dash `—` in ~15 places (STANDARDS §20.5 / copy rule).

## What works (keep)
- Settings window: `dir`/`lang` applied from settings, logical properties almost everywhere (detect: 2 physical vs 0 class), axe 0 on all tabs in both themes and languages, sidebar mirrors correctly.
- Lead fields already `dir="ltr"` (`settings.html:612-700`); popup phone value `dir="ltr"`.
- Time inputs for quiet hours render `22:30` / `07:15` correctly in RTL (no fix needed).
- All 164 tests pass; i18n tables currently have 389/389 keys (parity holds, just untested).

## Conflicts with project rules
- None found. BRAND.md lists emoji icons in popup actions - kept; only new strings avoid emoji (copy rule).

## Not checked (❓) and why
- AI layer (dim 9): not in scope of this round.
- Real screen reader: no NVDA session available to the agent.
- Installed copy (`C:\Program Files\TapAct`, elevated) - not driven by design; source run only.
- Installer language marker path (`first-run-language.txt`) - covered by unit test only; running the installer is forbidden.
