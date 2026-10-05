# TapAct Settings Window — Upgrade Report

Branch: `upgrade/2026-09-24`. Scope: Settings window only (see UPGRADE-PLAN.md
for the one justified exception — window dimensions in `main.js`).

This report covers two rounds: **S1+S2** (window sizing/responsiveness +
density toggle, shipped as v3.1.0) and **S3** (added after an independent
evaluator flagged that the original ask — competitor-inspired reorganization,
not just sizing — was still open; shipped as v3.2.0).

## Root cause

`desktop-agent/src/main.js` (`createSettingsWindow`, pre-upgrade):
```
settingsWindow = new BrowserWindow({ width: 720, height: 760, minWidth: 640, minHeight: 600, ... })
```
Fixed 220px sidebar + 3-column preference grids + the newly-inlined
clipboard-history list all competing for ~460px of usable content width —
the direct cause of "too small." But the user's complaint also named
"לא מובן מה לעשות ואיך לעשות" (unclear what to do and how), which is a
content-organization problem, not a sizing one: the 6 detector toggles were
a flat list with no grouping, and each type's on/off switch lived in a
different tab from its "what should it do" dropdown. S3 addresses that part.

## 10-dimension scores (before → after S1+S2 → after S3)

| # | Dimension | Before | After S1+S2 | After S3 | Evidence |
|---|---|---|---|---|---|
| 1 | RTL/Hebrew | 8 | 8 | 8 | Unchanged; new S3 strings (group labels, order hint, favorite/drag labels) went through `hebrew-copywriting`, regular hyphens, no direction breaks in screenshots. |
| 2 | Responsive/sizing | **3** | **8** | 8 | Unchanged from S1 — see `screenshots/before/` vs `/after/`. |
| 3 | Accessibility (WCAG 2.2) | 7 | 7 | 7 | S3 added a keyboard/screen-reader path for reordering (▲/▼ buttons with `aria-label`, since native HTML5 drag-and-drop isn't keyboard-operable) and `aria-label`s on the favorite star — but still not re-audited live with axe. Carried forward as untested, not inflated. |
| 4 | Design/brand quality | 6 | 8 | 8 | Brand palette untouched; grouped panels read as intentional information architecture, matching the existing "panel-title" convention used elsewhere (`settings.css` `.panel-title`, unchanged style, reused for the 3 new detector groups). |
| 5 | UX flows & states | 4 | 7 | **8** | S3: the 6 detector toggles are now grouped into 3 real categories (`יצירת קשר` / `ניווט ומשלוחים` / `קישורים ותוכן`) as separate `.panel`s, each toggle sits inline with its own action-preference dropdown (previously a different tab), and a single Save persists both. `detectors-grouped.png`. |
| 6 | Forms | 6 | 7 | 7 | Unchanged in S3 — the moved `<select>`s are the same elements, just relocated; no new validation. |
| 7 | Perceived performance | 7 | 7 | 7 | Drag-and-drop reorder and favorite-toggle re-render are synchronous local array operations, no new IPC round-trips beyond the existing save. |
| 8 | Ease of configuration | 5 | 7 | **8** | S3: custom detection rules (the one list where order is functionally load-bearing — first regex match wins, see `src/lib/detectors/custom.js`) got real drag-to-reorder + keyboard alternative; message templates got a favorites concept (★, cap of 3, sorted to top) as TapAct's equivalent of the competitor's "pin frequent items," since TapAct has no floating quick-access widget to pin *into*. |
| 9 | AI layer / config-and-ai | ❓ | ❓ | ❓ | Still out of scope — leads AI toggle/key field untouched. |
| 10 | Code health (UI) | 7 | 7.5 | 7.5 | S3 changes are additive (new functions `moveCustomRule`, `orderedTemplatesForDisplay`, `toggleTemplateFavorite`-inline-handler); found and fixed one real pre-existing bug while wiring this — `onSaveTemplates()` was stripping unknown fields (`{id, label, text}` only) before saving, which would have silently dropped `favorite` on every save if left alone. |

**Definition of Done**: still not fully met — dimension 3 (accessibility) and
9 (AI layer) remain below/unverified as documented above. Dimensions 5 and 8,
the two most directly tied to the user's "unclear what to do" complaint, now
meet the ≥8 bar.

## What was executed

**S1** — `upgrade(S1): resize Settings window + responsive layout + tab-scroll reset`
— `main.js` (window 720×760→1040×780, min 640×600→860×620), `settings.css`
(sidebar `clamp()`, capped `.tab-panel` width), `settings.js` (scroll-reset
on tab switch).

**S2** — `upgrade(S2): display-density toggle (comfortable/compact)`
— `settings.html`/`settings.js`/`settings.css`, Hebrew copy via
`hebrew-copywriting`.

**S4 (first release)** — version bump to 3.1.0, `npm run dist`, release
`v3.1.0` published via `gh`.

**S3** (this round) — `upgrade(S3): group detector settings, drag-reorder custom rules, template favorites`:
- `settings.html` — Detectors tab restructured from one flat `.panel` of 6
  toggles into 3 grouped `.panel`s (`יצירת קשר`, `ניווט ומשלוחים`,
  `קישורים ותוכן`); the 4 per-type action-preference `<select>`s moved
  inline next to their own toggle (previously a separate panel in a
  different tab); that old panel now only holds the generic auto-run
  toggle/delay, with an updated subtitle. New order-matters hint box added
  to the custom-rules tab.
- `settings.js` — `onSaveDetectors()` now saves `actionPreferences` too (one
  Save for the whole tab); `buildCustomRuleCard()` gained a drag handle
  (HTML5 DnD) plus ▲/▼ buttons (`moveCustomRule()`) as the keyboard-
  accessible equivalent; `buildCard()` (templates) gained a ★ favorite
  toggle (`MAX_FAVORITE_TEMPLATES = 3`), `orderedTemplatesForDisplay()`
  sorts favorites to the top for rendering without touching the saved
  array order; fixed `onSaveTemplates()` dropping unknown fields (would
  have silently discarded `favorite` on save).
- `settings.css` — `.det-pref` inline select styling + narrow-width
  wrap rule; `.drag-handle`/`.reorder-btn`/`.tag-card.dragging`;
  `.fav-star-btn`/`.card.favorited`.
- `src/lib/i18n-renderer.js` — **found during verification**: this app has
  a second, separate Hebrew/English string dictionary that overwrites
  `data-i18n` text at runtime after page load, so editing `settings.html`
  text alone is not sufficient for any *existing* i18n key (new keys with
  no dictionary entry fall back to the static HTML correctly). Updated the
  `he`/`en` entries for the 2 keys this round's copy changed
  (`detectors.subtitle2`, `settings.actions.sub`) and added the 4 new keys
  (3 group labels + the order hint) to both languages so language-switching
  doesn't regress this screen.
- `npm test`: **124/124 passing** after every commit in this round.
- Verified via the same offscreen-render method as S1/S2 (real
  `settings.html`/`settings.js`/`store.js`, seeded data, `capturePage()`):
  `.claude/upgrade/screenshots/after-s3/{detectors-grouped,custom-rules-drag-reorder,templates-favorites}.png`.

## What was deliberately NOT force-fit (with reasoning)

- **Reordering the 5 built-in detector types (phone/tracking/address/url/
  email/datetime toggles)** — not given drag-to-reorder. Their evaluation
  order is a hardcoded array in `src/lib/detectors/index.js`
  (`DETECTORS = [...]`), not driven by any user setting, and the code
  explicitly notes "first match wins, most-specific first" as a deliberate
  ordering by detector *quality*, not user preference. Adding a drag UI
  that reorders something with no behavioral effect would be actively
  misleading — it would look like a priority control that does nothing.
- **A literal floating "pin toolbar" like the competitor's** — TapAct is a
  clipboard-history + popup-action tool, not a persistent menu-bar app; it
  has no always-on surface to pin items into. The favorites concept was
  adapted instead: mark up to 3 templates so they sort to the top of the
  list you already open, which is the same "surface what I use most" goal
  without inventing a UI surface TapAct doesn't have.
- **Drag-reorder on tag rules or detector groups themselves** — tag rules
  are independent keyword matchers (a copied text can pick up multiple
  tags), so their list order has no first-match-wins semantics either;
  reordering them would be cosmetic-only, same reasoning as the built-in
  detectors. Left alone for the same reason.

## `[needs-human]`

1. **Live accessibility re-audit** (dimension 3) — not re-tested with axe or
   a real keyboard/screen-reader session against the running app; only
   verified via offscreen render + code reading. The new ▲/▼ reorder
   buttons and favorite star need a real screen-reader pass to confirm they
   read sensibly in context, not just that the `aria-label`s exist.
2. **AI layer** (dimension 9) — leads AI cleanup toggle/API key field
   untouched and unevaluated across both rounds.
3. **Favorites cap UX** — hitting the 3-favorite cap currently just silently
   no-ops the star click (no toast/message explaining why). Minor, but
   worth a small follow-up if users report confusion.

## Next steps (top 3)

1. Run a live-app accessibility pass (axe + real keyboard/screen-reader
   walkthrough) on the built Settings window, covering the new grouped
   detectors tab and the drag-reorder/favorite controls specifically.
2. Consider whether tag rules or custom rules would benefit from the same
   grouping treatment detectors got, if the list grows past what fits on
   one screen.
3. If the 3-favorite cap turns out to be confusing in practice, add a short
   inline message when the cap is hit (needs one more short Hebrew string
   via `hebrew-copywriting`).

---

# Round 3 — Accessibility pass (WCAG 2.2 AA), shipped as v3.2.1

Branch `upgrade/2026-09-24-a11y`. Scope: `desktop-agent/src/settings/{settings.html,settings.js,settings.css}`.
`preload.js` needed no change; the only other file touched is the `package.json` version bump.
This round exists because both evaluator rounds held dimension 3 at 7: nobody had run a live keyboard or axe pass.
Round-2 `[needs-human]` #1 (this pass) and #3 (favorites-cap message, committed as the WIP commit at the start of this branch) are now closed.

## Method (live, not code-reading)

- **Harness** `.claude/upgrade/a11y-harness/harness-main.js`: a standalone Electron main.
  - Loads the real `settings.html` / `settings.js` / `preload.js` against the real `lib/store.js` in an isolated userData dir.
  - Mirrors main.js's IPC channel names, including `sanitizeSettingsPatch`.
  - Seeded with 4 templates (2 favorited), 3 custom rules, 1 tag rule, 3 clipboard items (incl. `שלום John 050-1234567 ₪1,234`) and 1 send-history row.
- **Driver** `.claude/upgrade/a11y-harness/drive.cjs`: launches Electron with `--remote-debugging-port` and connects Playwright via `chromium.connectOverCDP`.
  - Playwright's `_electron.launch` fails on Electron 44 ("Process failed to launch").
  - All keyboard input is real CDP key events (`keyboard.press('Tab'|'Enter'|'Space')`), not `.click()`.
- **Per tab × config** (10 tabs × {he-dark, he-light, en-dark}):
  - Tab-walk from the nav into the panel, recording every focus stop plus its computed focus indicator. For a switch, the indicator is read from the visible `.slider`.
  - axe-core (wcag2a/2aa/21aa/22aa + best-practice).
  - Chromium's full AX tree via CDP `Accessibility.getFullAXTree`, listing interactive nodes with an empty name.
  - A computed-color contrast sweep of every visible text node. It alpha-composites ancestor backgrounds and opacity, and tests **each gradient stop** (axe only reports gradients as "incomplete").
- **Raw results:** `.claude/upgrade/a11y-{before,after}-{he-dark,he-light,en-dark}.json`.
- **Screenshots:** `screenshots/a11y-before/` and `screenshots/a11y-after/` (`<tab>__1040x780__<theme>__<lang>.png` plus `focus-*` close-ups).

## Findings (before) → fix → verified after

| # | Finding (evidence) | Sev | Fix | After (evidence) |
|---|---|---|---|---|
| A1 | **Focus dropped to `<body>` after ▲/▼ reorder.** Tab to ▼ on rule 1 → Enter: the order did change, but `activeElement=body` (`a11y-before-he-dark.json` → `interactions.reorder.focusAfterEnter`). A 2nd Space did nothing: the buttons work once, then the keyboard user is lost. | high | `moveCustomRule`: after re-render, focus the moved rule's same-direction button (or the opposite one at the edge) | Enter → focus `הזז למטה: מספר הזמנה פנימי`; Space moves it again (rule now 3rd), focus → `הזז למעלה: …` |
| A2 | Same focus loss on the **favorite star** (`favorite.focusAfter=body`) and on **delete** in tag rules (`deleteFocus=body`) | high | Star refocuses its own button after the re-sort (`data-template-id`). Deletes (templates / rules / tags) focus the list's "+ add" button | star → `הסר מהמועדפים: הצעת מחיר`; delete → `addTagRuleBtn` |
| A3 | **Detector rows (v3.2.0 regression).** The row `<label>` wraps both the new `<select>` and the switch, so `label.control` = the select (`labelControl: prefPhoneSelect`). 4 switches had **no accessible name**, and clicking the row text focused the dropdown instead of toggling (`afterClick.checked=false`) | high | `for="detectXCheck"` on each row. Switch: `aria-labelledby` (type name) + `aria-describedby` (description). Select: `aria-labelledby` | `labelControl: detectPhoneCheck`; row click toggles (`checked: true`); 0 unnamed |
| A4 | **Unnamed form controls.** axe `label` ×18 + `select-name` ×1: template name inputs/textareas (8), `trayClickSelect`, 5 General number inputs, `leadDupWindow`, 2 clip-history limits. The `div.field-label` text was not associated with its input | high | 17 `div.field-label` → `<label for>` (same class/text). Template name `aria-label` "שם התבנית"; textarea `aria-labelledby` its name field. Quiet-hours `<label for>` | axe label/select-name 0; AX unnamed 21 → 0 |
| A5 | Custom-rule switch named by `title` only (axe `label-title-only` ×3) | med | `aria-label` "פעיל: <rule>" | 0 |
| A6 | Clipboard row = `role=button` containing ▶/✕ buttons (axe `nested-interactive` ×3) | med | Copy target moved to the text block (`.clip-item-content`, role=button, Enter/Space). Actions are siblings; a mouse click anywhere on the row still copies | 0 |
| A7 | **Shortcut fields mouse-only.** Capture started on `click` only (the field is readonly). Each click also stacked another document keydown listener | high | Enter/Space on the focused field starts capture; re-entry guard | Tab → field → Enter → capturing → Ctrl+Alt+K recorded, capture ends |
| A8 | Segmented controls (language/theme/density) exposed no state (`aria-pressed` null ×6); captions were `<label>`s bound to nothing | med | `aria-pressed` synced in `applyAppLanguage/Theme/Density`; `role=group` + `aria-labelledby` | `[true,false,true,false,true,false]` |
| A9 | Footer 🌐 was a click-only `<span>` (tabIndex -1); header pills were named "🌙" / "🌐 EN" | low | Footer → real `<button>`; pills get `aria-label` (existing titles) | footer BUTTON, tabIndex 0 |
| A10 | `<input type=time>`: the 3rd tab stop (picker) had no ring (`quietHoursStart/EndInput`) | med | `input[type=time]:focus-within` ring, plus a zero-specificity `:where(...):focus-visible` fallback ring | 0 gaps, all configs |
| A11 | Save/status messages silent to screen readers | low | `role="status"` on all 20 `.saved-msg` (incl. favorites-cap) | `capMsg.role=status` |
| A12 | English UI had Hebrew aria-labels on JS-built controls | low | `A11Y_STRINGS` he/en + `a11yT()` (reads `document.lang`); cards rebuilt on language switch; names include the item ("Move down: <rule>") | en: `Move down: מספר הזמנה פנימי` |

### Contrast — computed ratios (AA: text 4.5:1; icons and control boundaries 3:1)

| Element | Theme | Before | After | Change |
|---|---|---|---|---|
| Header subtitle (`--muted` on purple header) | light | **1.00** | 4.75+ | white 0.88 |
| Header title (gradient text fading to navy on purple) | light | fails (gradient) | white | solid white in light |
| Header pills (white on white-washed purple) | light | 3.97 | 7.59 | dark tint |
| Nav group labels / footer (`--faint`) | dark | 3.01 | 5.17 | #5a6478 → #808aa0 |
| Nav group labels / footer (`--faint`) | light | 2.47 | 4.84 | #9198b0 → #60677f |
| White on brand gradient, `#a855f7` stop (primary buttons, active seg/chip) | both | 3.96 | 5.38 | `--brand-fill-*` #5558e0 → #9333ea (text-bearing fills only; the switch track keeps the decorative gradient) |
| Inactive seg button (`--muted` on `--input-bg`) | dark | 4.44 | 4.79 | `--muted` #8892a4 → #8e98aa |
| Danger buttons | light | 3.95 | 5.30 | #dc2626 → #b91c1c |
| "✓ פעיל" shortcut badge | light | 2.77 | 6.00 | #16a34a → #166534 |
| Favorite star ★ (icon) | light | 2.85 | 4.49 | `--warning` #d97706 → #b45309 |
| `code` tokens / clip tag chips | light | 1.66 / 1.59 | 5.18 | #4f52c8 |
| About version/build/copyright (opacity 0.6 / 0.5) | light | 4.31 / 3.20 | ≥5.3 | `color: var(--muted)` instead of opacity |
| Input/select/textarea border vs panel (1.4.11) | dark / light | 1.39 / 1.59 | 3.45 / 3.61 | `--control-border` |
| Focus ring #6366f1 vs surfaces (1.4.11) | dark / light | 3.12-4.22 / 3.72-4.47 | same | already ≥3:1 |

Remaining sweep items after the fix, all documented false-positives:
- ☆ / ⠿ at 4.41: these are icons, so the requirement is 3:1.
- ▶ / ✕ in clipboard rows at "1.0": they are `opacity:0` until row hover/focus-within; when visible they are 12.7:1.

## Contracts

| Contract | Before | After |
|---|---|---|
| axe violations, 10 tabs × 3 configs | he-dark 118 · he-light 138 · en-dark 118 | **0 in every tab of every config** |
| Interactive AX nodes with empty name | 21 per config | **0** |
| Tab stops with no computed focus indicator | 2 per config | **0** |
| ▲/▼ usable repeatedly by keyboard | once, then focus lost | **yes** |
| Star / delete keep focus | no | **yes** |
| Shortcut recordable without mouse | no | **yes** |
| Distinct text-contrast failures (own sweep, incl. gradient stops) | 26 dark / 42 light | **0 real** |
| `npm test` | 124/124 | **124/124** |

## Score — dimension 3 only (others not re-scored this round)

| # | Dimension | Before | After | Evidence |
|---|---|---|---|---|
| 3 | Accessibility (WCAG 2.2) | 7 | **8** | 0 axe / 0 unnamed / 0 focus-ring gaps over 30 tab×config runs. Every custom control was operated with real key events. Every contrast pair was recomputed from live computed styles. |

Why 8 and not 9:
- **No real screen reader was run** (NVDA/Narrator). Announcement behaviour is unverified, e.g. whether `role=status` fires when a message un-hides from `display:none`.
- **Focus stays on the nav after a tab is activated**, so reaching the content means tabbing through the remaining nav items.
- **A reorder doesn't announce the rule's new position.**

## New Hebrew text — flagged for copy review

This agent had no Skill tool, so `hebrew-copywriting` could not be invoked. The 2 new strings were drafted by following that skill's SKILL.md (read from disk): plain wording, regular hyphen, no emoji. Both are screen-reader-only (aria-label):
- `שם התבנית` (template name field)
- `העתק` (clipboard copy target, as `העתק: <text>`)

Everything else reuses existing strings.

## `[needs-human]` (round 3)

1. Copy review of the 2 strings above (STANDARDS §20.5).
2. One real NVDA or Narrator session on the installed 3.2.1 (live-region announcements, reorder).
3. Brand sign-off on `--brand-fill-*` (#5558e0 → #9333ea): the same gradient one step deeper, used only under white text.
4. Repo-root `version.json` still says 3.0.0 (stale since before round 1; the app reads `package.json`). Untouched.
