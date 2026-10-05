# EVAL - TapAct desktop-agent v3.9.0 - round 1

> evaluator: `upgrade-evaluator` (separate context). date: 2026-10-05 · against: UPGRADE-PLAN.md 2026-10-05 · live app: YES (own CDP harness on REAL `src/main.js`, temp userData, `--lang=he-IL/en-US`, clipboard/shortcuts/login-item/openExternal stubbed; 22 window states + 4 language-resolution runs + seeded Settings run). Evidence: scratchpad `ev/out/*.png`, `ev/full.json`, `ev/seeded.json`.
> rule: default 5, raise only with own evidence. Upgrader explanations not used.

## Contracts

| sprint | contract | result | evidence |
|---|---|---|---|
| S1 | first-run language (locale + marker) | PASS | he-IL->he, en-US->en, en-US+marker he->he, he-IL+marker en->en (4/4 live) |
| S1 | welcome lang/dir/theme in 4 configs, console 0 | PASS | doc he/rtl, en/ltr, data-theme dark/light, console [] in all 4; leaks only endonym "English/עברית" + bilingual lang-toggle tooltip |
| S1 | resolver unit tests, npm test green | PASS | tests/store.test.js:378; 185/185 |
| S2 | detect 0 rtl.physical-css; class hits ignored w/ reason | PASS | detect-eval.json (src): physical-css 0, physical-class 2 = i18n prose, ignore has reason |
| S2 | shortcuts dir=ltr, Ctrl+/Win+, no overflow | PASS | shortcutManualInput ltr/isolate "Ctrl+Alt+P", sw<=cw, he+en |
| S2 | template label/textarea unicode-bidi plaintext he+en | PASS | 12/12 fields plaintext; settings-templates__en__light.png punctuation correct |
| S2 | history URL LTR | PASS | history__he__light.png |
| S2 | 0 `→` in STRINGS.he | PASS | tests/i18n.test.js:24 |
| S3 | hints match code (sampled 16) | PASS w/ 2 nits | see (b) below |
| S3 | i18n parity test; dedupe 0/undef/30 test | PASS | tests/i18n.test.js, window-behavior.test.js:157 |
| S3 | no select overflow | PASS | 0 fields sw>cw in 10 tabs x 2 langs |
| S4 | axe serious/critical = 0 on welcome/popup/action/history | **FAIL** | welcome steps 2-5 color-contrast 3.88:1 all 4 configs (welcome.css:231 `.lede.muted opacity .75`); history nested-interactive 2-4 all 4 configs (clipboard-history.js:239 row role=button contains pin/delete buttons) |
| S4 | color-scheme per theme in Settings | PASS | computed color-scheme dark/light |
| S5 | v3.9.0 release exe+blockmap+latest.yml, sha512 match | PASS | GitHub digest sha256 exe = local 9a2cd1f7...; local sha512 = published latest.yml r2G5v6eX...IA==; tag = master 80f22f9 |

(b) settings truth sample: monitor, autoLaunch, startMinimized, closeToTray, notifications, sound, startPaused, trayClick, poll, dedupe, autoClose, sendDedupe, quietHours, autoRun, autoRunDelay, detectors.datetime - all true. Nits: autoRun "hover pauses" = actually restarts full delay on leave (main.js:1168-1170); notifications fire also on manual phone popup (main.js:432).

## Scores

| # | dimension | before | after | evidence |
|---|---|---|---|---|
| 1 | RTL & Hebrew | 3 | 8 | dir correct 22/22 states; LTR isolate on shortcuts/regex/URL/phone/email; plaintext on user text. Leak: settings.html:781 `title="Change language"` English in he |
| 2 | Responsive | 5 | 7 | docX 0 everywhere; welcome last step 449>425px, "Open Settings" CTA half under footer |
| 3 | Accessibility | 6 | 6 | Settings axe 0; welcome contrast + history nested-interactive serious remain |
| 4 | Design & brand | 5 | 6 | welcome light works; history + action-popup still dark when theme=light (history__he__light.png) |
| 5 | UX flows | 5 | 7 | 5-step guide, true copy, correct tray instructions; CTA hidden on last step |
| 6 | Forms | 5 | 7 | dedupe 0 fixed, Ctrl/Win display; General tab still 3 separate save buttons |
| 7 | Perceived perf | 6 | 7 | 0 console errors in 22 states, no FOUC; 1 unreproduced sandbox-preload error in 1/7 launches |
| 8 | Ease of setup | 4 | 8 | language 4/4, hints true 16/16 (2 nits) |
| 9 | AI | ❓ | ❓ | out of scope |
| 10 | UI code health | 5 | 6 | +21 tests, helpers extracted; main.js 1785 / settings.js 1465 lines |

## Regressions
None found (Settings axe 0 before/after; no window lost dir/theme).

## 3 worst remaining
1. clipboard-history.js:239 - row `role=button` nests buttons (axe serious, every config).
2. welcome.css:231 - `.lede.muted` opacity .75 -> 3.88:1 on 4 of 5 steps.
3. history + action-popup ignore light theme (no light CSS).

## Verdict
`ANOTHER-ROUND` - fix: S4 welcome contrast; S4 history nested-interactive; settings.html:781 English tooltip in he; welcome last-step CTA visible without scroll. Light theme for history/action-popup = [needs-human] (plan).
