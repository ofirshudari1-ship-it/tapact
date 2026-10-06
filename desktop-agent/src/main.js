const { app, Tray, Menu, BrowserWindow, clipboard, shell, screen, ipcMain, globalShortcut, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Explicit app identity (v3.0.0 rebrand from ActionClip -> TapAct): Electron
// derives app.getPath('userData') and the taskbar/notification identity
// (AppUserModelId on Windows) from app.setName()/productName, and would
// otherwise keep resolving to the old "actionclip"-derived name from a
// stale package.json read or Windows' cached shortcut data. Set both
// explicitly and early so every OS-facing identity actually matches
// the new package.json `productName`/`build.appId` (com.tapact.app).
app.setName('TapAct');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.tapact.app');
}

// File logger — writes to %APPDATA%\TapAct\logs\tapact.log
// Rotates when the file exceeds 5 MB (keeps previous file as .1).
const LOG_LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' };
let _logStream = null;

function _getLogStream() {
  if (_logStream) return _logStream;
  try {
    const logsDir = path.join(app.getPath('userData'), '..', 'TapAct', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'tapact.log');
    try {
      const stat = fs.statSync(logFile);
      if (stat.size > 5 * 1024 * 1024) {
        fs.renameSync(logFile, logFile + '.1');
      }
    } catch (_) { /* first run, file doesn't exist yet */ }
    _logStream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' });
  } catch (_) { /* if we can't create logs, silently continue */ }
  return _logStream;
}

function log(level, msg, extra) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}\n`;
  const stream = _getLogStream();
  if (stream) stream.write(line);
  if (level === LOG_LEVELS.ERROR) console.error(line.trimEnd());
  else if (level === LOG_LEVELS.WARN) console.warn(line.trimEnd());
}

const { findPhone, fillTemplate, buildWhatsAppUrl, normalizeWhatsAppTarget } = require('./lib/phone');
const { findGenericAction } = require('./lib/detectors');
const { classifyCopy } = require('./lib/detect-order');
const { UPDATE_CHECK_INTERVAL_MS, shouldRunPeriodicCheck, shouldPromptForVersion } = require('./lib/update-schedule');
const { isAllowedExternalUrl } = require('./lib/safe-url');
const { validateRule } = require('./lib/detectors/custom');
const store = require('./lib/store');
const { postJson, cleanupLeadWithAi, buildShareText, buildMailtoUrl } = require('./lib/lead-delivery');
const { resolveDedupeMs, shouldHideToTray, shouldShowTrayHideHint, autoLaunchNeedsReconcile, resolveTrayClickTarget, shouldPrimeClipboardOnResume } = require('./lib/window-behavior');
const { createCursorTrail, computeAnchoredPopupPosition, computeFitBounds, boundsCorrection, nudgeInside } = require('./lib/popup-placement');
const { decideAutoPopup, isQuietHours, computeSnoozeUntil, normalizeSnooze, createBurstGuard } = require('./lib/popup-policy');
const { sanitizeSettingsPatch } = require('./lib/settings-guard');
const { buildRedactedSettingsSnapshot, buildSystemInfoText } = require('./lib/diagnostics');
const { createZip } = require('./lib/zip-writer');
const i18n = require('./lib/i18n-renderer');
const { formatAccelerator } = require('./lib/accelerator-format');

// The tray menu, tray tooltip/balloons and native dialogs below are all
// main-process UI with no renderer/DOM in the loop, so they never went
// through window.i18n.applyI18n() and stayed hardcoded in Hebrew (tray) or
// English (the update-ready dialog) regardless of the language the user
// actually has TapAct set to - a real language-purity leak (`STANDARDS.md`
// / language-consistency guarantee). i18n-renderer.js's `t(lang, key)`
// export has no DOM dependency, so it's reused here directly.
function tr(key) {
  return i18n.t(store.getSettings().language || 'en', key);
}
const { version: APP_VERSION } = require('../package.json');
const { buildDate: APP_BUILD_DATE } = (() => { try { return require('../../version.json'); } catch { return {}; } })();

// Default keyboard shortcuts - all overridable from Settings ▸ קיצורי מקלדת
// (see registerAllShortcuts). Win+V is Windows' own built-in clipboard-
// history shortcut; Electron can only register it once Windows itself
// isn't holding it anymore (Settings > System > Clipboard > Clipboard
// history, turned off) - that's a system-settings change this app can't
// make for the user. Ctrl+Alt+V is a fallback that works regardless.
// Above this length, a copy is a paragraph/document, not a phone number,
// tracking number, address or URL - none of which are ever this long. Running
// the detectors (and popping a popup) on large copies was just noise, so
// automatic clipboard polling skips detection entirely past this point; a
// manual re-check (tray "בדוק שוב"/shortcut) still runs detection regardless,
// since that's an explicit ask, not something we're second-guessing.
const MAX_ACTION_DETECT_LENGTH = 500;

const DEFAULT_SHORTCUTS = {
  manual: 'CommandOrControl+Alt+P',
  history: 'Super+V',
  historyFallback: 'CommandOrControl+Alt+V'
};

// Tracks which of the three logical shortcuts are actually registered right
// now, so Settings can show live status ("✓ פעיל" vs "✗ תפוס") instead of
// the user having to guess why a key combo silently does nothing.
let shortcutStatus = { manual: false, history: false, historyFallback: false };

// True only while an actual app quit is in progress (tray "יציאה", the
// auto-updater installing an update, etc.) — see shouldHideToTray in
// lib/window-behavior.js for why this flag exists: without it, "יציאה"
// would silently fail to quit whenever the Settings window happened to be
// open, because app.quit() closes windows the same way the user's own X
// button does, and would hit the same closeToTray interception.
let isQuitting = false;

let tray = null;
let popupWindow = null;
let actionPopupWindow = null;
let historyWindow = null;
let settingsWindow = null;
let clipboardTimer = null;
let autoCloseTimer = null;
let autoRunTimer = null;
let trayClickTimer = null; // debounces tray 'click' so a double-click doesn't also fire the single-click action (see createTray)

let lastClipboardText = '';
let lastNotifiedAt = new Map(); // normalized phone -> timestamp ms
let lastGenericNotifiedAt = new Map(); // "type:raw" -> timestamp ms
// Where the copy happened: the cursor is sampled on every poll tick, and the
// sample from the tick before the one that noticed the change is used (the
// cursor may already have moved on by the time the change is detected).
const cursorTrail = createCursorTrail();
const burstGuard = createBurstGuard();
let popupAnchor = null;          // { point, rtl } of the popup that is currently open
let popupBurstNotice = false;    // the popup that tripped the burst guard shows a one-time hint
const popupHolds = new Set();    // reasons the auto-close countdown is paused (hover, focus, menu...)
let countdownState = { durationMs: 0, startedAt: 0, paused: false };
let snoozeTimer = null;
let burstTimer = null;
let currentPopupPhone = null; // { raw, normalized, display }
let currentGenericAction = null; // detector result, see lib/detectors/*.js

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Password managers (1Password, Bitwarden, etc.) and Windows' own
// Clipboard History both respect this de-facto standard clipboard format
// to mean "don't log this copy anywhere" - honoring it here too means a
// copied password never lands in the on-disk clipboard history, without
// needing any password-specific detection of our own.
// electron@44's clipboard module is fully Promise-based (readText/writeText/
// read/has all return Promises now, modeled on the W3C navigator.clipboard
// API) - there is no synchronous availableFormats() anymore, so this reads
// clipboard.read()'s ClipboardItem[] and checks each item's .types instead.
async function clipboardExcludedFromHistory() {
  try {
    const items = await clipboard.read();
    return items.some((item) => item.types.some((t) => /exclude/i.test(t) && /monitor/i.test(t)));
  } catch (err) {
    return false;
  }
}

// Tags a clipboard text with the same category a detector would show a
// popup for, regardless of whether that detector is currently enabled -
// the history panel's point is to show what was actually copied, so
// categorization here is independent of the settings.detectors toggles
// that only gate the instant action popup. Generic detectors are checked
// before phone for the same reason checkClipboard does it below (an
// Israel Post tracking number's 9-digit run reads as a valid phone number
// under findPhone's loose heuristic).
// Reorders an action's actions[] so the user's preferred one (Settings ▸
// הגדרות ▸ פעולת ברירת מחדל, matched by the detector's own action `id`)
// comes first - that's the one the popup shows as its big primary button,
// the history panel's ▶ quick-action runs, and auto-run (if enabled) fires.
function applyActionPreference(action, settings) {
  if (!action || !action.actions || action.actions.length < 2) return action;
  const preferredId = (settings.actionPreferences || {})[action.type];
  if (!preferredId) return action;
  const idx = action.actions.findIndex((a) => a.id === preferredId);
  if (idx <= 0) return action;
  const reordered = [action.actions[idx], ...action.actions.filter((_, i) => i !== idx)];
  return { ...action, actions: reordered };
}

// The one place that decides how a WhatsApp chat is opened, honoring Settings >
// General > "Where WhatsApp opens". 'desktop' falls back to WhatsApp Web when no
// app is registered for whatsapp:// (otherwise Windows would show "no app to open").
function resolveWhatsAppUrl(normalizedPhone, message) {
  let target = normalizeWhatsAppTarget(store.getSettings().whatsappTarget);
  if (target === 'desktop') {
    let hasApp = false;
    try { hasApp = !!app.getApplicationNameForProtocol('whatsapp://'); } catch (_) { /* treat as not installed */ }
    if (!hasApp) target = 'web';
  }
  return buildWhatsAppUrl(normalizedPhone, message, target);
}

// The only way data-driven URLs (history actions, custom rules, detector output) reach the OS:
// anything outside the scheme allowlist (file:, ms-msdt:, javascript:, ...) is refused and logged.
function openExternalSafe(url) {
  if (!isAllowedExternalUrl(url)) {
    log(LOG_LEVELS.WARN, 'openExternal refused: scheme not allowed', { scheme: String(url).slice(0, 12).replace(/[^a-z0-9:+.\-]/gi, '?') });
    return false;
  }
  shell.openExternal(url);
  return true;
}

// A stored history action: WhatsApp ones keep the phone (`wa`) so the link is built
// when clicked, using whatever target is selected THEN - not the one at copy time.
function actionUrl(action) {
  if (!action) return '';
  return action.wa ? resolveWhatsAppUrl(action.wa, '') : action.url;
}

function categorizeForHistory(text) {
  const picked = classifyCopy(text, { tracking: true, address: true, url: true, email: true }, store.getCustomActionRules(), store.getSettings().language);
  if (picked && picked.kind === 'action') {
    const preferred = applyActionPreference(picked.action, store.getSettings());
    return { category: preferred.type, actions: preferred.actions };
  }
  const phone = picked && picked.kind === 'phone' ? picked.phone : null;
  if (phone) {
    return { category: 'phone', actions: [{ label: `WhatsApp: ${phone.display}`, url: buildWhatsAppUrl(phone.normalized, '', 'web'), wa: phone.normalized }] };
  }
  return { category: 'text', actions: null };
}

function startClipboardWatcher() {
  stopClipboardWatcher();
  const { pollMs } = store.getSettings();
  clipboardTimer = setInterval(pollTick, pollMs);
}

function stopClipboardWatcher() {
  if (clipboardTimer) clearInterval(clipboardTimer);
  clipboardTimer = null;
}

let clipboardCheckInFlight = false;

function ownWindowFocused() {
  try {
    const f = BrowserWindow.getFocusedWindow();
    return !!f && !f.isDestroyed();
  } catch (_) { return false; }
}

// One cheap cursor sample per poll tick (GetCursorPos), so the popup can open
// where the copy was made even though detection lags by up to one interval.
function pollTick() {
  const now = Date.now();
  try {
    const p = screen.getCursorScreenPoint();
    cursorTrail.push({ x: p.x, y: p.y, t: now, ownFocus: ownWindowFocused() });
  } catch (_) { /* no cursor sample this tick */ }
  return checkClipboard(now);
}

// Single place that puts text on the clipboard on behalf of TapAct itself
// (paste from history, merged paste, lead "copy" channel): updates the
// baseline FIRST so the next poll tick never treats it as a new copy.
async function writeClipboardFromApp(text) {
  lastClipboardText = text;
  await clipboard.writeText(text);
}

// electron@44's clipboard.readText() returns a Promise<string> (the whole
// clipboard module was migrated to the W3C navigator.clipboard-style async
// API - there is no synchronous string-returning readText() anymore, even
// though every version of this app before this fix called it as if there
// were). That mismatch is also the real explanation for the "clipboard
// sync quirk" this codebase used to blame for returning `{}` instead of a
// string: a Promise object is truthy and typeof 'object', so it slipped
// past `if (!text)` the same way any other unexpected object would, and
// crashed a few calls deep the same way. The typeof-string guard added for
// that crash was correct defense in depth, but it also meant every poll
// tick silently no-opped forever afterwards - detection was never actually
// broken by environment flakiness, it just never ran a single successful
// tick after that fix landed, on this Electron version.
async function checkClipboard(tickAt = Date.now()) {
  const settings = store.getSettings();
  if (!settings.enabled) return;
  if (clipboardCheckInFlight) return; // don't overlap polls if one is still resolving
  clipboardCheckInFlight = true;

  let text;
  try {
    text = await clipboard.readText();
  } catch (err) {
    clipboardCheckInFlight = false;
    return;
  }
  if (typeof text !== 'string' || !text || text === lastClipboardText) {
    clipboardCheckInFlight = false;
    return;
  }
  lastClipboardText = text;

  // Where was the cursor when the copy happened, and was a TapAct window the
  // one being used? (Both from the tick before this one, see pollTick.)
  const copySample = cursorTrail.pick(tickAt);
  let copyPoint = copySample ? { x: copySample.x, y: copySample.y } : null;
  if (!copyPoint) { try { copyPoint = screen.getCursorScreenPoint(); } catch (_) { copyPoint = null; } }
  const copyInOwnWindow = !!(copySample && copySample.ownFocus) || ownWindowFocused();

  // Everything below used to run unguarded: any exception here (a bad
  // tag rule, a store write failure, anything) left clipboardCheckInFlight
  // stuck at `true` forever, since it was only ever reset to `false` on
  // the *success* path - every later poll tick then hit the `if
  // (clipboardCheckInFlight) return` guard above and returned immediately
  // without even reading the clipboard again. That's a silent, permanent,
  // whole-app detection outage from a single bad copy, recoverable only by
  // restarting TapAct - and invisible, because nothing was ever logged for
  // it. try/finally guarantees the flag always clears; the catch logs the
  // failure so a future recurrence is diagnosable from tapact.log instead
  // of just "it stopped working" with no trace.
  try {
    if (settings.historyEnabled !== false && !(await clipboardExcludedFromHistory())) {
      const { category, actions } = categorizeForHistory(text);
      const tags = store.computeTags(text);
      store.addClipboardHistoryItem({ text, category, actions, tags });
      broadcastHistoryItemsChanged();
      // Only rebuild the tray's "recent actions" submenu when this copy
      // actually had one - keeps every other clipboard tick (the common
      // case: plain text with no detected action) from paying for a menu
      // rebuild it wouldn't change.
      if (actions && actions.length && tray && !tray.isDestroyed()) {
        tray.setContextMenu(buildTrayMenu());
      }
    }
  } catch (err) {
    log(LOG_LEVELS.ERROR, 'checkClipboard: history/categorization step failed', { message: err && err.message });
  } finally {
    clipboardCheckInFlight = false;
  }

  // Same reasoning as above, but this half never touched the in-flight
  // flag (already cleared by the finally block) - an exception here only
  // ever dropped one popup, not the whole watcher. Still wrapped, and still
  // logged, so a real detector bug shows up in tapact.log instead of
  // silently doing nothing.
  try {
    const dedupeMs = resolveDedupeMs(settings.dedupeSeconds);
    const now = Date.now();
    const policyBase = {
      text,
      ownWindowFocused: copyInOwnWindow,
      snoozeUntil: currentSnoozeUntil(),
      quiet: isQuietHours(settings.quietHours, new Date(now)),
      burstPaused: burstGuard.isPaused(now),
      now
    };

    // Generic detectors (tracking/address/url) run before phone on purpose:
    // findPhone's "bare 9-digit run" heuristic (see lib/phone.js) treats any
    // 9 consecutive digits as a landline missing its leading 0, which is
    // exactly the digit portion of an Israel Post S10 tracking number
    // (2 letters + 9 digits + 2 letters, e.g. RR123456789IL) - so checking
    // phone first used to steal every such tracking number into the WhatsApp
    // popup instead of the tracking one. Structured patterns (UPS/DHL/S10
    // prefixes, address regex, bare-URL) are inherently less prone to false
    // positives than that heuristic, so they get first refusal.
    if (text.length > MAX_ACTION_DETECT_LENGTH) return; // large copy - see MAX_ACTION_DETECT_LENGTH

    const detectors = settings.detectors || {};
    const picked = classifyCopy(text, detectors, store.getCustomActionRules(), settings.language);
    const action = picked && picked.kind === 'action' ? picked.action : null;
    if (action) {
      const dedupeKey = `${action.type}:${action.raw}`;
      const lastSeen = lastGenericNotifiedAt.get(dedupeKey) || 0;
      if (now - lastSeen < dedupeMs) return;
      // Still logged to history above; the policy only decides about the popup.
      const decision = decideAutoPopup({ ...policyBase, type: action.type, phone: null, detectorEnabled: true });
      if (!decision.show) { log(LOG_LEVELS.INFO, `popup skipped (${decision.reason})`, { type: action.type }); return; }
      lastGenericNotifiedAt.set(dedupeKey, now);
      currentGenericAction = applyActionPreference(action, settings);
      popupBurstNotice = burstGuard.recordOpen(now).paused;
      if (popupBurstNotice) onBurstPaused();
      playDetectSound(settings);
      openActionPopupWindow(false, copyPoint);
      return;
    }

    if (picked && picked.kind === 'phone') {
      const found = picked.phone;
      {
        const lastSeen = lastNotifiedAt.get(found.normalized) || 0;
        if (now - lastSeen < dedupeMs) return;
        const decision = decideAutoPopup({ ...policyBase, type: 'phone', phone: found, detectorEnabled: true });
        if (!decision.show) { log(LOG_LEVELS.INFO, `popup skipped (${decision.reason})`, { type: 'phone' }); return; }
        lastNotifiedAt.set(found.normalized, now);
        const trip = burstGuard.recordOpen(now);
        popupBurstNotice = trip.paused;
        if (trip.paused) onBurstPaused();
        playDetectSound(settings);
        handlePhoneDetected(found, settings, false, copyPoint);
      }
    }
  } catch (err) {
    log(LOG_LEVELS.ERROR, 'checkClipboard: detection step failed', { message: err && err.message });
  }
}

function playDetectSound(settings) {
  if (settings.soundOnDetect) {
    try { shell.beep(); } catch (_) { /* not fatal - just skip the beep */ }
  }
}

// Manual trigger (tray menu item or global shortcut): re-reads the
// clipboard right now regardless of the poll interval or dedupe cooldown,
// and opens a popup either way - with whatever was detected, or the phone
// popup empty so the rep can paste/type a number by hand (same fallback
// the Chrome extension offers when a copy doesn't contain a recognizable
// number).
async function triggerManualPopup() {
  let text = '';
  try {
    text = await clipboard.readText();
  } catch (err) {
    text = '';
  }
  if (typeof text !== 'string') text = '';

  const settings = store.getSettings();

  const detectorsCfg = settings.detectors || {};
  const picked = classifyCopy(text, detectorsCfg, store.getCustomActionRules(), settings.language); // see lib/detect-order.js for the order rules
  const action = picked && picked.kind === 'action' ? picked.action : null;
  if (action) {
    currentGenericAction = applyActionPreference(action, settings);
    popupBurstNotice = false;
    openActionPopupWindow(true);
    return;
  }

  const phone = picked && picked.kind === 'phone' ? picked.phone : null;
  if (phone) {
    popupBurstNotice = false;
    handlePhoneDetected(phone, store.getSettings(), true);
    return;
  }

  currentPopupPhone = null;
  popupBurstNotice = false;
  openPopupWindow(true);
}

function handlePhoneDetected(phone, settings, takeFocus = false, anchorPoint = null) {
  // The manual shortcut / tray item always opens the popup, whatever the automatic action is set to.
  const action = takeFocus ? 'popup' : ((settings.actionPreferences || {}).phone || 'popup');
  if (action === 'none') return;
  if (action === 'call') {
    openExternalSafe('tel:+' + phone.normalized);
    return;
  }
  if (action === 'whatsapp') {
    openExternalSafe(resolveWhatsAppUrl(phone.normalized, ''));
    return;
  }
  // default: 'popup'
  currentPopupPhone = phone;
  openPopupWindow(takeFocus, anchorPoint);
}

// takeFocus: only for popups the user asked for (shortcut/tray). Automatic ones
// appear without stealing keyboard focus, so a rep mid-sentence isn't interrupted.
function openPopupWindow(takeFocus = false, anchorPoint = null) {
  clearAutoRunTimer(); // a replaced action popup's pending auto-run must not fire into this popup
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close();
  }
  // Only one popup is ever meant to be on screen at a time - the phone popup
  // and the generic action popup share a single autoCloseTimer/autoRunTimer
  // (see resetAutoCloseTimer/closePopup), so leaving the OTHER type's window
  // open here would let opening this one silently reset/extend the other's
  // countdown. Closing it here keeps that shared timer correct.
  if (actionPopupWindow && !actionPopupWindow.isDestroyed()) {
    actionPopupWindow.close();
  }
  popupHolds.clear();

  const width = 320;
  const height = 230; // initial guess; the popup reports its real content height via popup:fit
  const { rect, anchor } = anchoredRect(anchorPoint, width, height);
  popupAnchor = { ...anchor, width };

  const win = new BrowserWindow({
    ...rect,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 280,
    minHeight: 120,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'popup', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  popupWindow = win;

  win.loadFile(path.join(__dirname, 'popup', 'popup.html'), { query: bootQuery() });
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    placePopupWindow(win, popupIntendedRects.get(win) || rect);
    if (takeFocus) win.show(); else win.showInactive();
    if (popupWindow === win) resetAutoCloseTimer();
  });
  // A replaced popup's 'closed' arrives AFTER the new one was created: it must
  // only clean up if it is still the current popup (it used to null the new
  // window's reference, and the new window's ready-to-show then threw).
  win.on('closed', () => {
    if (popupWindow === win) {
      popupWindow = null;
      clearAutoCloseTimer();
    }
  });
}

// Resolves where a popup of width x height goes: next to the copy point (or the
// cursor, for manual opens), on the display that contains that point.
function anchoredRect(anchorPoint, width, height) {
  const point = anchorPoint || screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const rtl = store.getSettings().language === 'he';
  const wa = display.workArea;
  const h = Math.min(height, Math.max(120, wa.height - 16));
  const { x, y } = computeAnchoredPopupPosition({ point, width, height: h, workArea: wa, rtl });
  return { rect: { x, y, width, height: h }, anchor: { point, rtl } };
}

// DIP bounds can be applied with the wrong scale factor on mixed-DPI setups
// (the window is still on the old display while being moved): re-apply once if
// the result differs from what was asked for.
const popupIntendedRects = new WeakMap(); // last bounds we asked for (the renderer may have fitted since creation)
function placePopupWindow(win, rect) {
  if (!win || win.isDestroyed()) return;
  popupIntendedRects.set(win, rect);
  win.setBounds(rect);
  const fix = boundsCorrection(rect, win.getBounds());
  if (fix) win.setBounds(fix);
  // Fractional scales (125%) can make the window 1-2px bigger than asked:
  // keep the real bounds inside the work area of the display it is on.
  const actual = win.getBounds();
  const wa = screen.getDisplayNearestPoint({ x: actual.x + Math.round(actual.width / 2), y: actual.y + Math.round(actual.height / 2) }).workArea;
  const nudge = nudgeInside(actual, wa);
  if (nudge) win.setPosition(nudge.x, nudge.y);
}

function openActionPopupWindow(takeFocus = false, anchorPoint = null) {
  if (actionPopupWindow && !actionPopupWindow.isDestroyed()) {
    actionPopupWindow.close();
  }
  // See the matching comment in openPopupWindow() - the two popup types share
  // one autoCloseTimer/autoRunTimer, so both must never be open at once.
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close();
  }
  popupHolds.clear();

  const width = 280;
  // Long/wrapped custom-rule action labels can push actual content past this
  // estimate; the popup reports its measured height via action-popup:fit and
  // the body scrolls internally (action-popup.css) as a safety net.
  const estimatedHeight = 104 + 38 * ((currentGenericAction && currentGenericAction.actions.length) || 1);
  const { rect, anchor } = anchoredRect(anchorPoint, width, estimatedHeight);
  popupAnchor = { ...anchor, width };

  const win = new BrowserWindow({
    ...rect,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'action-popup', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  actionPopupWindow = win;

  win.loadFile(path.join(__dirname, 'action-popup', 'action-popup.html'), { query: bootQuery() });
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    placePopupWindow(win, popupIntendedRects.get(win) || rect);
    if (takeFocus) win.show(); else win.showInactive();
    if (actionPopupWindow === win) {
      resetAutoCloseTimer();
      resetAutoRunTimer();
    }
  });
  win.on('closed', () => {
    if (actionPopupWindow === win) {
      actionPopupWindow = null;
      clearAutoCloseTimer();
    }
  });
}

function activePopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) return popupWindow;
  if (actionPopupWindow && !actionPopupWindow.isDestroyed()) return actionPopupWindow;
  return null;
}

// Which detector the open popup belongs to (for "don't show for <type>").
function currentPopupType() {
  if (actionPopupWindow && !actionPopupWindow.isDestroyed()) return currentGenericAction ? currentGenericAction.type : null;
  if (popupWindow && !popupWindow.isDestroyed()) return 'phone';
  return null;
}

function closePopup() {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close();
  if (actionPopupWindow && !actionPopupWindow.isDestroyed()) actionPopupWindow.close();
  clearAutoRunTimer();
  popupHolds.clear();
  countdownState = { durationMs: 0, startedAt: 0, paused: false };
}

// Standalone QUICK-ACCESS history popup (Win+V equivalent): a small,
// frameless, closes-on-blur panel meant for "glance, grab one, gone" -
// reached only via the two global shortcuts (Win+V / Ctrl+Alt+V) and the
// tray menu's explicit "היסטוריית העתקות" item / left-click-action. This is
// deliberately kept as its own lightweight window (distinct from the fuller
// browsing experience embedded in Settings ▸ היסטוריית לוח, see
// getHistoryEmbedView below) because it needs to pop up instantly at the
// cursor, over whatever app currently has focus, and get out of the way the
// moment focus moves on - a Settings window is neither. It is NOT part of
// the tray double-click flow: see createTray()'s click/double-click
// debounce for why double-clicking the tray only ever opens Settings.
function openHistoryWindow() {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const width = 380;
  const height = 560;
  let x = cursor.x + 12;
  let y = cursor.y + 12;
  const bounds = display.workArea;
  if (x + width > bounds.x + bounds.width) x = bounds.x + bounds.width - width - 8;
  if (y + height > bounds.y + bounds.height) y = bounds.y + bounds.height - height - 8;
  x = Math.max(bounds.x + 8, x);
  y = Math.max(bounds.y + 8, y);

  historyWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'clipboard-history', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  historyWindow.loadFile(path.join(__dirname, 'clipboard-history', 'clipboard-history.html'), { query: bootQuery() });
  historyWindow.once('ready-to-show', () => historyWindow.show());
  historyWindow.on('blur', () => {
    if (historyWindow && !historyWindow.isDestroyed()) historyWindow.close();
  });
  historyWindow.on('closed', () => { historyWindow = null; });
}

// Re-reads the clipboard right now and records it as "already seen", without
// logging or acting on it. Called just before monitoring resumes: the poll
// loop doesn't read the clipboard at all while paused, so without this the
// first tick after resuming would treat whatever was copied DURING the pause
// as new and write it to the on-disk history (and pop a popup for it) -
// exactly what the user paused to avoid. See shouldPrimeClipboardOnResume.
async function primeClipboardBaseline() {
  try {
    const text = await clipboard.readText();
    if (typeof text === 'string') lastClipboardText = text;
  } catch (_) { /* unreadable clipboard - nothing to baseline against */ }
}

// Single source of truth for pausing/resuming monitoring, shared by the
// tray menu's "ניטור לוח פעיל" checkbox AND the Settings window's General >
// monitoring switch - neither reimplements this, so the two surfaces can
// never drift out of sync.
async function setMonitoringEnabled(next) {
  const wasEnabled = store.getSettings().enabled;
  if (shouldPrimeClipboardOnResume({ wasEnabled, willBeEnabled: next })) {
    await primeClipboardBaseline(); // BEFORE saving, so no poll tick can slip in between
  }
  store.saveSettings({ enabled: next });
  if (wasEnabled !== next) log(LOG_LEVELS.INFO, `Clipboard monitoring ${next ? 'resumed' : 'paused'}`);
  broadcastMonitoringState();
  return next;
}

function toggleMonitoring(forceValue) {
  const next = typeof forceValue === 'boolean' ? forceValue : !store.getSettings().enabled;
  return setMonitoringEnabled(next);
}

// Pushes the current monitoring state to every surface that displays it:
// tray menu/tooltip and an open (or hidden-to-tray) Settings window. The
// Settings push matters for correctness, not just looks: its General panel
// "Save" sends `enabled` from its own checkbox, so a stale checkbox
// (monitoring paused from the tray while Settings was open) used to
// silently turn monitoring back on the next time the user saved any
// unrelated general setting.
function broadcastMonitoringState() {
  const { enabled } = store.getSettings();
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:monitoring-changed', enabled);
  }
}

// After clipboard history is deleted/cleared, the tray's "recent actions"
// submenu (which previews the copied TEXT itself) must drop what it was
// showing - leaving it would keep displaying content the user just
// explicitly deleted.
function refreshHistorySummaries() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

// Tells every open history surface (the standalone quick-access popup from
// a hotkey/tray click, AND the Settings window's own clipboard-history tab,
// which renders the list as plain DOM and refetches on this same event) to
// re-fetch and re-render.
function broadcastHistoryItemsChanged() {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.webContents.send('history-panel:items-changed');
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('history-panel:items-changed');
  }
}

// The auto-close countdown only runs while nothing holds it: hover, a focused
// field, the "more options" section and the snooze menu each add a hold
// (popup:hold from the popup). When the last hold is released the countdown
// restarts from the full duration. The popup draws the thin bar from the state
// pushed here, so what the bar shows is what the timer will do.
function pushCountdown() {
  const win = activePopupWindow();
  if (win && !win.webContents.isDestroyed()) win.webContents.send('popup:countdown', countdownState);
}

function resetAutoCloseTimer() {
  clearAutoCloseTimer();
  const { autoCloseSeconds } = store.getSettings();
  if (!autoCloseSeconds) {
    countdownState = { durationMs: 0, startedAt: 0, paused: false };
  } else if (popupHolds.size) {
    countdownState = { durationMs: autoCloseSeconds * 1000, startedAt: 0, paused: true };
  } else {
    autoCloseTimer = setTimeout(closePopup, autoCloseSeconds * 1000);
    countdownState = { durationMs: autoCloseSeconds * 1000, startedAt: Date.now(), paused: false };
  }
  pushCountdown();
}

function clearAutoCloseTimer() {
  if (autoCloseTimer) clearTimeout(autoCloseTimer);
  autoCloseTimer = null;
}

function setPopupHold(reason, on) {
  if (typeof reason !== 'string' || !reason || !activePopupWindow()) return;
  if (on) popupHolds.add(reason); else popupHolds.delete(reason);
  clearAutoCloseTimer();
  clearAutoRunTimer();
  resetAutoCloseTimer();
  if (!popupHolds.size && actionPopupWindow && !actionPopupWindow.isDestroyed()) resetAutoRunTimer();
}

// Typing/clicking inside a popup restarts the countdown (only when nothing holds it).
function notePopupActivity() {
  if (popupHolds.size || !activePopupWindow()) return;
  resetAutoCloseTimer();
  if (actionPopupWindow && !actionPopupWindow.isDestroyed()) resetAutoRunTimer();
}

// Optional (off by default, Settings ▸ הגדרות ▸ הרצה אוטומטית): fires the
// action popup's primary action by itself after autoRunDelaySeconds,
// instead of waiting for a click - the popup still shows first so there's
// a visible window to cancel by closing it. Phone popups don't get this -
// they need the name/template filled in first, which isn't something to
// auto-fire.
function resetAutoRunTimer() {
  clearAutoRunTimer();
  const settings = store.getSettings();
  if (!settings.autoRunAction) return;
  const delay = Math.max(1, settings.autoRunDelaySeconds || 4);
  autoRunTimer = setTimeout(() => {
    const action = currentGenericAction;
    const chosen = action && action.actions && action.actions[0];
    if (chosen && chosen.url) openExternalSafe(chosen.url);
    closePopup();
  }, delay * 1000);
}

function clearAutoRunTimer() {
  if (autoRunTimer) clearTimeout(autoRunTimer);
  autoRunTimer = null;
}

let welcomeWindow = null;
let splashWindow = null;

// STANDARDS.md §19: minimum on-screen time (avoids a flash-of-splash on a
// fast local load) and a safety timeout (guarantees the splash can never get
// stuck forever if something upstream hangs).
const SPLASH_MIN_MS = 800;
const SPLASH_SAFETY_TIMEOUT_MS = 8000;

function maybeShowWelcome() {
  // TapAct is a tray-first background agent — on every launch after the
  // very first one, isWelcomeSeen() is true and the app goes straight to the
  // tray with zero windows (see app.whenReady below). A splash screen only
  // makes sense for the one case where a window does appear on startup: the
  // first-run welcome screen. It is intentionally skipped on all later
  // launches and when reopened from the tray's "מה זה TapAct?" item
  // (openWelcomeWindow) — a branded loading screen in front of an
  // already-seen, instantly-loading local window would just be an
  // unnecessary delay, not real loading feedback.
  if (!store.isWelcomeSeen()) showFirstRunWelcomeWithSplash();
}

// Branded splash screen per STANDARDS.md §19 — frameless, transparent,
// rounded corners via CSS, TapAct's brand gradient (assets/BRAND.md),
// the real app logo as the dominant element, and a continuous spinner
// (no fake progress bar, since there's no real percentage to report for a
// local file load).
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash', 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  return Date.now();
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

// Shows the splash, then creates the first-run welcome window with
// `show: false` and only reveals it once its content is actually ready
// (`ready-to-show`) — enforcing SPLASH_MIN_MS before closing the splash so a
// near-instant local load doesn't flicker, and SPLASH_SAFETY_TIMEOUT_MS so a
// stuck load can never leave the splash on screen forever (STANDARDS.md
// §19.2).
function showFirstRunWelcomeWithSplash() {
  const splashShownAt = createSplash();

  const win = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    title: tr('welcome.doc.title'),
    webPreferences: {
      preload: path.join(__dirname, 'welcome', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  welcomeWindow = win;
  win.loadFile(path.join(__dirname, 'welcome', 'welcome.html'), welcomeLoadOptions());
  win.on('closed', () => { welcomeWindow = null; });

  let revealed = false;
  const reveal = () => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    const elapsed = Date.now() - splashShownAt;
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    setTimeout(() => {
      closeSplash();
      if (!win.isDestroyed()) win.show();
    }, remaining);
  };

  win.once('ready-to-show', reveal);
  // Safety timeout: fires independently of `reveal` above and is a no-op if
  // reveal() already ran, so a hung load still guarantees the splash (and
  // then the welcome window, ready or not) is shown within 8s.
  setTimeout(() => {
    if (revealed) return;
    revealed = true;
    closeSplash();
    if (win && !win.isDestroyed()) win.show();
  }, SPLASH_SAFETY_TIMEOUT_MS);
}

// First-run onboarding: a few steps explaining what TapAct actually
// does, with a skip option at every step - opens automatically once (see
// maybeShowWelcome), and any time after that from the tray menu ("מה זה
// TapAct") for anyone who wants the tour again.
function openWelcomeWindow() {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.focus();
    return;
  }
  welcomeWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    frame: false,
    center: true,
    title: tr('welcome.doc.title'),
    webPreferences: {
      preload: path.join(__dirname, 'welcome', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  welcomeWindow.loadFile(path.join(__dirname, 'welcome', 'welcome.html'), welcomeLoadOptions());
  welcomeWindow.on('closed', () => { welcomeWindow = null; });
}

// Read by src/lib/window-boot.js in every window's <head>: sets lang/dir/
// theme before the first paint (the windows otherwise start from their HTML
// defaults until their own IPC init returns).
function bootQuery() {
  const settings = store.getSettings();
  return { lang: settings.language === 'he' ? 'he' : 'en', theme: settings.theme === 'light' ? 'light' : 'dark' };
}

// Language, theme and the two shortcuts the guide mentions, handed to the
// welcome page in its URL so welcome-boot.js can set dir/lang/theme before
// the first paint (an IPC round-trip would land after it, and the page's CSP
// blocks inline scripts).
function welcomeLoadOptions() {
  const settings = store.getSettings();
  const configured = { ...DEFAULT_SHORTCUTS, ...(settings.shortcuts || {}) };
  return {
    query: {
      ...bootQuery(),
      manual: configured.manual || '',
      // Win+V only works once Windows' own clipboard history is off, so the
      // guide shows the shortcut that is actually registered right now.
      history: shortcutStatus.history === true ? configured.history : configured.historyFallback
    }
  };
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // .show() first: the window may currently be hidden-to-tray
    // (closeToTray), and focus() alone does not reliably un-hide it.
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    // Was 720x760 (min 640x600) - too cramped for the sidebar-nav + panel
    // layout once the clipboard-history tab was inlined as real DOM: the
    // 3-column preference grids and the history list both had to squeeze
    // into ~460px of usable content width. Wider default + higher floor so
    // the layout in settings.css has room to breathe; still user-resizable.
    width: 1040,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    title: tr('settings.windowTitle'),
    webPreferences: {
      preload: path.join(__dirname, 'settings', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'), { query: bootQuery() });
  settingsWindow.on('close', (e) => {
    const settings = store.getSettings();
    if (shouldHideToTray({ closeToTray: settings.closeToTray, isQuitting, hasTray: tray && !tray.isDestroyed() })) {
      e.preventDefault();
      settingsWindow.hide();
      maybeShowTrayHideHint(settings);
    }
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// --- Snooze (popups only; history logging and manual triggers are unaffected) ---

function currentSnoozeUntil() {
  const raw = store.getSettings().snoozeUntil;
  const norm = normalizeSnooze(Number(raw), Date.now());
  if (norm !== (Number(raw) || 0)) store.saveSettings({ snoozeUntil: norm }); // expired: auto-clear
  return norm;
}

function formatClock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function scheduleSnoozeExpiry() {
  if (snoozeTimer) clearTimeout(snoozeTimer);
  snoozeTimer = null;
  const until = currentSnoozeUntil();
  if (!until) return;
  snoozeTimer = setTimeout(() => {
    snoozeTimer = null;
    currentSnoozeUntil(); // clears the stored value
    refreshTray();
    broadcastSettingsState();
  }, Math.min(until - Date.now() + 50, 2147483000));
}

function setSnoozeUntil(ts) {
  store.saveSettings({ snoozeUntil: ts });
  scheduleSnoozeExpiry();
  refreshTray();
  broadcastSettingsState();
}

function clearSnooze() { setSnoozeUntil(0); }

function refreshTray() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu());
}

// Tells an open Settings window what changed outside it (snooze set/cleared,
// a detector switched off from a popup) so its switches and status line are true.
function broadcastSettingsState() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const st = store.getSettings();
    settingsWindow.webContents.send('settings:state-changed', { snoozeUntil: currentSnoozeUntil(), detectors: st.detectors });
  }
}

// The popup that trips the burst guard tells the user (inside itself); the
// tray tooltip says it too until the pause is over. Never a Windows notification.
function onBurstPaused() {
  refreshTray();
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = setTimeout(() => { burstTimer = null; refreshTray(); }, burstGuard.pausedUntil() - Date.now() + 50);
}

// Snooze / skip chosen from a popup's menu. 'type' turns that detector off
// (visible, and undoable, in Settings > Detection types).
function handlePopupSnooze(kind) {
  const type = currentPopupType();
  if (kind === 'type') {
    if (type && type !== 'custom' && Object.prototype.hasOwnProperty.call(store.getSettings().detectors || {}, type)) {
      store.saveSettings({ detectors: { [type]: false } });
      broadcastSettingsState();
    }
  } else if (['m15', 'h1', 'tomorrow'].includes(kind)) {
    setSnoozeUntil(computeSnoozeUntil(kind, Date.now()));
  } else {
    return;
  }
  closePopup();
}

// First time (only) a window is hidden instead of closed, tell the user
// where it went via a tray balloon — directly answers the "wait, did it
// close?" confusion a tray app's two kinds of 'close' can otherwise cause.
function maybeShowTrayHideHint(settings) {
  if (!shouldShowTrayHideHint({ hideHintSeen: settings.trayHideHintSeen })) return;
  store.saveSettings({ trayHideHintSeen: true });
  if (tray && !tray.isDestroyed()) {
    tray.displayBalloon({
      iconType: 'info',
      title: tr('tray.hideHint.title'),
      content: tr('tray.hideHint.content'),
      largeIcon: false,
      noSound: true
    });
  }
}

const CATEGORY_TRAY_ICON = { phone: '📞', tracking: '📦', address: '🗺️', url: '🔗', email: '✉️', custom: '⚡', text: '📋' };

// Tray-menu label for one recent-actions entry: icon + a short preview of
// what was copied, truncated so it doesn't blow out the menu's width.
function trayActionLabel(item) {
  const icon = CATEGORY_TRAY_ICON[item.category] || '📋';
  const preview = (item.text || '').replace(/\s+/g, ' ').trim().slice(0, 34);
  return `${icon} ${preview}${item.text && item.text.length > 34 ? '…' : ''}`;
}

// "Recent actions" quick-repeat submenu (Raycast/ClipboardFusion-style):
// re-fires the primary action of one of the last few detected copies
// directly from the tray, without reopening the full history panel or
// re-copying anything.
function buildRecentActionsSubmenu() {
  const recent = store.getRecentActionableHistory(5);
  if (!recent.length) {
    return [{ label: tr('tray.recentActions.empty'), enabled: false }];
  }
  return recent.map((item) => ({
    label: trayActionLabel(item),
    sublabel: item.actions[0].label,
    click: () => {
      const chosen = item.actions[0];
      if (chosen && actionUrl(chosen)) openExternalSafe(actionUrl(chosen));
    }
  }));
}

function buildTrayMenu() {
  const settings = store.getSettings();
  const configured = { ...DEFAULT_SHORTCUTS, ...(settings.shortcuts || {}) };
  const snoozeUntil = currentSnoozeUntil();
  if (tray) {
    let tip = settings.enabled ? tr('tray.tooltip.active') : tr('tray.tooltip.paused');
    if (settings.enabled && snoozeUntil) tip = tr('tray.tooltip.snoozed').replace('{time}', formatClock(snoozeUntil));
    else if (settings.enabled && burstGuard.isPaused(Date.now())) tip = tr('tray.tooltip.burst');
    tray.setToolTip(tip);
  }
  const snoozeItems = snoozeUntil
    ? [{ label: tr('tray.snooze.active').replace('{time}', formatClock(snoozeUntil)), click: clearSnooze }]
    : [{
      label: tr('tray.snooze.title'),
      submenu: [
        { label: tr('tray.snooze.m15'), click: () => setSnoozeUntil(computeSnoozeUntil('m15')) },
        { label: tr('tray.snooze.h1'), click: () => setSnoozeUntil(computeSnoozeUntil('h1')) },
        { label: tr('tray.snooze.tomorrow'), click: () => setSnoozeUntil(computeSnoozeUntil('tomorrow')) }
      ]
    }];
  return Menu.buildFromTemplate([
    { label: settings.enabled ? tr('tray.status.active') : tr('tray.status.paused'), enabled: false },
    { type: 'separator' },
    {
      label: tr('settings.monitor.enabled'),
      type: 'checkbox',
      checked: settings.enabled,
      click: (menuItem) => toggleMonitoring(menuItem.checked)
    },
    ...snoozeItems,
    { label: tr('tray.openManual').replace('{shortcut}', formatAccelerator(configured.manual)), click: triggerManualPopup },
    { label: tr('tray.recentActions'), submenu: buildRecentActionsSubmenu() },
    { label: tr('tray.history').replace('{shortcut}', `${formatAccelerator(configured.history)} / ${formatAccelerator(configured.historyFallback)}`), click: openHistoryWindow },
    {
      label: tr('tray.refreshShortcuts') + (shortcutStatus.history ? '' : tr('tray.refreshShortcuts.warn')),
      click: () => {
        registerAllShortcuts();
        tray.setContextMenu(buildTrayMenu());
      }
    },
    {
      label: settingsWindow && !settingsWindow.isDestroyed() ? tr('tray.showSettings') : tr('tray.openSettings'),
      click: () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.show();
          settingsWindow.focus();
        } else {
          openSettingsWindow();
        }
      }
    },
    { label: tr('tray.about'), click: openWelcomeWindow },
    { type: 'separator' },
    {
      label: tr('tray.exit'),
      click: () => {
        // Must be set before app.quit(): see the isQuitting comment at its
        // declaration and shouldHideToTray in lib/window-behavior.js. Without
        // this, quitting while the Settings window is open would hit its
        // closeToTray interception and silently cancel the whole quit.
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function handleTrayClick() {
  const settings = store.getSettings();
  const target = resolveTrayClickTarget(settings.trayClickAction);
  if (target === 'history') openHistoryWindow();
  else if (target === 'settings') openSettingsWindow();
}

// How long a single tray 'click' waits before actually firing, so a second
// click arriving within this window (forming a 'double-click') can cancel
// it instead of both firing. Below Windows' own double-click threshold
// (~500ms by default) so a genuine single click still feels immediate.
const TRAY_CLICK_DEBOUNCE_MS = 250;

function createTray() {
  tray = new Tray(path.join(ASSETS_DIR, 'tray.png'));
  tray.setContextMenu(buildTrayMenu());
  // Left single-click: configurable via Settings ▸ הגדרות (trayClickAction) -
  // defaults to opening the quick-access clipboard-history popup, the most
  // commonly reached-for action. Right-click always shows the full context
  // menu (Electron's default, unaffected by this) - that's still the only
  // path to "יציאה" so quitting is never one accidental click away.
  //
  // On Windows, Electron's Tray fires 'click' for EACH click of a
  // double-click sequence and THEN fires 'double-click' on top of that -
  // so an unguarded double-click used to open History (from the first
  // 'click') AND Settings (from 'double-click') at once. Debouncing the
  // single-click action here, and having 'double-click' cancel it, means a
  // double-click only ever does one thing: open Settings (which is also
  // where the clipboard history now lives, see the "clipboard-history" tab
  // in settings.html) - never both windows.
  tray.on('click', () => {
    clearTimeout(trayClickTimer);
    trayClickTimer = setTimeout(() => {
      trayClickTimer = null;
      handleTrayClick();
    }, TRAY_CLICK_DEBOUNCE_MS);
  });
  tray.on('double-click', () => {
    clearTimeout(trayClickTimer);
    trayClickTimer = null;
    openSettingsWindow();
  });
}

// --- IPC: popup window ---

ipcMain.handle('popup:get-init-data', () => {
  const templates = store.getTemplates();
  const defaultTemplateId = store.getDefaultTemplateId();
  const settings = store.getSettings();
  return {
    phone: currentPopupPhone,
    templates,
    defaultTemplateId,
    history: store.getHistory(),
    sendDedupeMinutes: settings.sendDedupeMinutes,
    leadSettings: store.getLeadSettings(),
    leadHistory: store.getLeadHistory(),
    type: 'phone',
    burstNotice: popupBurstNotice,
    settings
  };
});

ipcMain.handle('popup:check-phone', (_event, text) => findPhone(text || ''));

ipcMain.on('popup:send', (_event, { phone, message, name, templateLabel }) => {
  // `phone` comes from the renderer's own state, not currentPopupPhone -
  // the rep may have typed a different number into the manual-entry
  // fallback than whatever (if anything) was auto-detected on open.
  // NOTE: popup is NOT closed here so multi-channel sends can complete;
  // the renderer calls popup:dismiss after all channels finish.
  if (phone && typeof phone.normalized === 'string' && /^[0-9]{8,15}$/.test(phone.normalized)) {
    openExternalSafe(resolveWhatsAppUrl(phone.normalized, typeof message === 'string' ? message : ''));
    store.addHistoryEntry({
      normalized: phone.normalized,
      display: phone.display,
      name: (name || '').trim(),
      templateLabel: templateLabel || ''
    });
    // Also record in lead history so duplicate detection works across channels
    store.addLeadHistoryEntry({
      name: (name || '').trim(),
      phone: phone.display || phone.normalized,
      role: '', source: '',
      channel: 'whatsapp'
    });
  }
});

ipcMain.on('popup:dismiss', () => closePopup());
ipcMain.on('popup:open-settings', () => openSettingsWindow());
ipcMain.on('popup:open-lead-settings', () => openSettingsWindow());
ipcMain.on('popup:activity', () => notePopupActivity());
// The popup measures its own content and asks the window to shrink-wrap it, so
// there is never an empty band at the bottom. Re-anchored to the copy point so
// it stays next to what was copied (and clear of the cursor) after resizing.
function fitActivePopup(contentHeight) {
  const win = activePopupWindow();
  if (!win || !Number.isFinite(contentHeight)) return;
  const b = win.getBounds();
  const a = popupAnchor || { point: screen.getCursorScreenPoint(), rtl: false };
  const wa = screen.getDisplayNearestPoint(a.point).workArea;
  placePopupWindow(win, computeFitBounds({ point: a.point, width: a.width || b.width, newHeight: contentHeight, workArea: wa, rtl: a.rtl }));
}
ipcMain.on('popup:fit', (_event, contentHeight) => fitActivePopup(contentHeight));
ipcMain.on('action-popup:fit', (_event, contentHeight) => fitActivePopup(contentHeight));
// Hover, a focused field, "more options" open and the snooze menu each hold the
// auto-close countdown; it restarts from the start once the last hold is released.
ipcMain.on('popup:hold', (_event, reason, on) => setPopupHold(reason, on === true));
ipcMain.on('action-popup:hold', (_event, reason, on) => setPopupHold(reason, on === true));
ipcMain.on('popup:snooze', (_event, kind) => handlePopupSnooze(kind));
ipcMain.on('action-popup:snooze', (_event, kind) => handlePopupSnooze(kind));
ipcMain.handle('popup:get-countdown', () => countdownState);
ipcMain.handle('action-popup:get-countdown', () => countdownState);
// Settings: status line "snoozed until ..." with a resume button.
ipcMain.handle('settings:resume-popups', () => { clearSnooze(); return { snoozeUntil: 0 }; });

// --- IPC: lead capture multi-channel delivery ---

ipcMain.handle('lead:send-channel', async (_event, { channel, lead }) => {
  // Always read sensitive config (URLs, auth headers) from the trusted store —
  // never from renderer-supplied leadSettings to prevent SSRF.
  const ls = store.getLeadSettings();
  try {
    if (channel === 'webhook') {
      const result = await postJson(ls.webhookUrl, { ...lead, sentAt: new Date().toISOString() }, ls.webhookHeaderName, ls.webhookHeaderValue);
      if (result.ok) store.addLeadHistoryEntry({ ...lead, channel: 'webhook' });
      return result;
    }
    if (channel === 'slack') {
      const text = buildShareText(lead, ls.messageTemplate);
      const result = await postJson(ls.slackWebhookUrl, { text });
      if (result.ok) store.addLeadHistoryEntry({ ...lead, channel: 'slack' });
      return result;
    }
    if (channel === 'email') {
      const url = buildMailtoUrl(lead, ls.emailAddress, ls.messageTemplate);
      openExternalSafe(url);
      store.addLeadHistoryEntry({ ...lead, channel: 'email' });
      return { ok: true };
    }
    if (channel === 'copy') {
      const text = buildShareText(lead, ls.messageTemplate);
      await writeClipboardFromApp(text);
      store.addLeadHistoryEntry({ ...lead, channel: 'copy' });
      return { ok: true };
    }
    return { ok: false, error: `${tr('lead.error.unknownChannel')}: ${channel}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('lead:ai-cleanup', async (_event, lead) => {
  const { aiApiKey } = store.getLeadSettings();
  return cleanupLeadWithAi(lead, aiApiKey);
});

ipcMain.handle('lead:test-channel', async (_event, { channel }) => {
  // Read URL and auth headers from the trusted store — never from renderer input.
  const ls = store.getLeadSettings();
  let url = '';
  let headerName = '';
  let headerValue = '';
  if (channel === 'webhook') { url = ls.webhookUrl; headerName = ls.webhookHeaderName || ''; headerValue = ls.webhookHeaderValue || ''; }
  else if (channel === 'slack') { url = ls.slackWebhookUrl; }
  if (!url) return { ok: false, error: tr('lead.error.urlRequired') };
  try {
    const testPayload = { test: true, source: 'TapAct', timestamp: new Date().toISOString() };
    const result = await postJson(url, testPayload, headerName, headerValue);
    return result;
  } catch (e) {
    return { ok: false, error: e.message || tr('lead.error.connection') };
  }
});

// --- IPC: lead settings (from settings window) ---

ipcMain.handle('settings:get-lead-settings', () => store.getLeadSettings());
ipcMain.on('settings:save-lead-settings', (_event, settings) => store.saveLeadSettings(settings));

ipcMain.on('settings:open-external', (_event, target) => {
  const urls = {
    changelog: 'https://tapact.app/changelog',
    site: 'https://tapact.app'
  };
  const url = urls[target];
  if (url) openExternalSafe(url);
});
ipcMain.handle('settings:get-lead-history', () => store.getLeadHistory());
ipcMain.on('settings:clear-lead-history', () => store.clearLeadHistory());

// --- IPC: generic action popup (tracking / address / url detectors) ---

ipcMain.handle('action-popup:get-init-data', () => ({ action: currentGenericAction, type: currentGenericAction ? currentGenericAction.type : null, burstNotice: popupBurstNotice, settings: store.getSettings() }));

ipcMain.on('action-popup:run', (_event, index) => {
  const action = currentGenericAction;
  const chosen = action && action.actions && action.actions[index];
  if (chosen && chosen.url) openExternalSafe(chosen.url);
  closePopup();
});

ipcMain.on('action-popup:dismiss', () => closePopup());
ipcMain.on('action-popup:open-settings', () => openSettingsWindow());
ipcMain.on('action-popup:activity', () => notePopupActivity());

// --- IPC: clipboard-history panel (Win+V-style) ---

ipcMain.handle('history-panel:get-data', (_event, { offset = 0, limit } = {}) => {
  const settings = store.getSettings();
  const page = store.getClipboardHistoryPage({ offset, limit: limit || settings.historyPreviewLimit || 50 });
  return {
    items: page.items,
    total: page.total,
    historyEnabled: settings.historyEnabled !== false,
    tagRules: store.getTagRules(),
    settings // so the panel follows the UI language, like every other window (§4)
  };
});

ipcMain.on('history-panel:copy-item', async (_event, id) => {
  const item = store.getClipboardHistory().find((i) => i.id === id);
  if (item) {
    await writeClipboardFromApp(item.text); // re-copying a history item must not re-trigger its own popup
  }
  if (historyWindow && !historyWindow.isDestroyed()) historyWindow.close();
});

ipcMain.on('history-panel:run-action', (_event, { id, index }) => {
  const item = store.getClipboardHistory().find((i) => i.id === id);
  const chosen = item && item.actions && item.actions[index];
  if (chosen && actionUrl(chosen)) openExternalSafe(actionUrl(chosen));
  if (historyWindow && !historyWindow.isDestroyed()) historyWindow.close();
});

// Multi-select "paste stack" (Ditto/ClipboardFusion's most-requested
// feature): the panel lets the user tick several history items in order,
// then this joins their text (in that same order) with a blank line between
// each and writes ONE combined block to the clipboard, ready for a single
// paste. Electron has no keystroke-injection API to actually drive a
// sequential "paste, advance, paste again" into another app's focused
// field, so this is the closest honest equivalent: one paste that carries
// everything the user picked, in the order they picked it.
ipcMain.on('history-panel:copy-merged', async (_event, ids) => {
  if (!Array.isArray(ids) || !ids.length) return;
  const all = store.getClipboardHistory();
  const byId = new Map(all.map((i) => [i.id, i]));
  const merged = ids.map((id) => byId.get(id)).filter(Boolean).map((i) => i.text).join('\n\n');
  if (merged) {
    await writeClipboardFromApp(merged); // the merged block must not re-trigger a popup
  }
  if (historyWindow && !historyWindow.isDestroyed()) historyWindow.close();
});

ipcMain.on('history-panel:toggle-pin', (_event, id) => {
  if (typeof id !== 'string') return;
  store.togglePinClipboardHistoryItem(id);
  broadcastHistoryItemsChanged();
});

// Export/import (local-only backup, and the realistic stand-in for
// cross-device sync without a backend: export on one PC, import on
// another). Same save/open-dialog pattern as the CSV exporters below.
ipcMain.handle('history-panel:export', async () => {
  const win = historyWindow || settingsWindow || BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: tr('dialog.export.clipboardHistory'),
    defaultPath: `tapact-clipboard-history-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  try {
    fs.writeFileSync(filePath, JSON.stringify(store.exportClipboardHistoryData(), null, 2), 'utf8');
    return { canceled: false, filePath };
  } catch (err) {
    return { canceled: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('history-panel:import', async () => {
  const win = historyWindow || settingsWindow || BrowserWindow.getFocusedWindow();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: tr('dialog.import.clipboardHistory'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths || !filePaths[0]) return { canceled: true };
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    const result = store.importClipboardHistoryData(data);
    broadcastHistoryItemsChanged();
    refreshHistorySummaries();
    return { canceled: false, ...result };
  } catch (err) {
    return { canceled: false, imported: 0, error: err?.message || String(err) };
  }
});

ipcMain.on('history-panel:delete-item', (_event, id) => {
  if (typeof id !== 'string') return;
  store.deleteClipboardHistoryItem(id);
  broadcastHistoryItemsChanged();
  refreshHistorySummaries();
});

ipcMain.on('history-panel:clear-all', () => {
  store.clearClipboardHistory();
  broadcastHistoryItemsChanged();
  refreshHistorySummaries();
});

ipcMain.on('history-panel:toggle-enabled', (_event, enabled) => {
  if (typeof enabled !== 'boolean') return;
  store.saveSettings({ historyEnabled: enabled });
});

ipcMain.on('history-panel:dismiss', () => {
  if (historyWindow && !historyWindow.isDestroyed()) historyWindow.close();
});

// --- IPC: welcome / onboarding window ---

ipcMain.on('welcome:finish', () => {
  store.markWelcomeSeen();
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close();
});
ipcMain.on('welcome:skip', () => {
  store.markWelcomeSeen();
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close();
});
// Last step's "Open Settings" button: same as finishing, then opens Settings.
ipcMain.on('welcome:open-settings', () => {
  store.markWelcomeSeen();
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close();
  openSettingsWindow();
});

// --- IPC: settings window ---

ipcMain.handle('settings:get', () => store.getSettings());

// --- IPC: update check (see initAutoUpdater/pushUpdateStatus above) ---
ipcMain.handle('update:get-status', () => store.getUpdateCheckStatus());
ipcMain.handle('update:check-now', () => {
  if (!app.isPackaged) return { started: false, reason: 'dev-build' };
  try {
    Promise.resolve(autoUpdater.checkForUpdates()).catch((err) => log(LOG_LEVELS.WARN, 'autoUpdater manual check rejected', { message: err?.message }));
    return { started: true };
  } catch (err) {
    pushUpdateStatus({ state: 'error', error: err?.message || String(err), lastCheckedAt: Date.now() });
    return { started: false, reason: err?.message || String(err) };
  }
});
// Used by the welcome window's language/theme toggles. Goes through the same
// allowlist + type validation as 'settings:save-settings' (previously it
// wrote any key/value the renderer sent straight into the store).
ipcMain.handle('settings:save-one', (_e, payload) => {
  const { key, value } = payload || {};
  if (typeof key !== 'string') return false;
  const safe = sanitizeSettingsPatch({ [key]: value });
  if (!Object.keys(safe).length) return false;
  store.saveSettings(safe);
  // Auto-install-on-quit is a live electron-updater flag (see the
  // autoUpdater.autoInstallOnAppQuit assignment above initAutoUpdater), not
  // just a stored value read back on next launch - flip it immediately so a
  // download already in flight (or already sitting ready) respects the new
  // choice without needing a restart.
  if (Object.prototype.hasOwnProperty.call(safe, 'autoInstallUpdates')) {
    autoUpdater.autoInstallOnAppQuit = safe.autoInstallUpdates;
  }
  // Language switched in the Welcome window: the tray menu and tooltip are built in the UI
  // language, so rebuild them now instead of at the next Settings save or restart.
  if (Object.prototype.hasOwnProperty.call(safe, 'language')) refreshTray();
  return true;
});

ipcMain.handle('settings:get-data', () => ({
  templates: store.getTemplates(),
  defaultTemplateId: store.getDefaultTemplateId(),
  settings: store.getSettings(),
  version: APP_VERSION,
  buildDate: APP_BUILD_DATE || '',
  defaultShortcuts: DEFAULT_SHORTCUTS,
  shortcutStatus
}));

ipcMain.on('settings:save-templates', (_event, { templates, defaultTemplateId }) => {
  store.saveTemplates(templates, defaultTemplateId);
});

ipcMain.on('settings:reset-templates', () => store.resetTemplates());

// Allowlist + per-key type validation lives in lib/settings-guard.js
// (SETTINGS_ALLOWLIST / sanitizeSettingsPatch) - shared with
// 'settings:save-one' above so both write paths enforce the same rules.
ipcMain.on('settings:save-settings', async (_event, settings) => {
  const safe = sanitizeSettingsPatch(settings);
  // Monitoring on/off goes through the same path as the tray (baseline-on-
  // resume, broadcast to every surface), not a raw store write.
  const hasEnabled = Object.prototype.hasOwnProperty.call(safe, 'enabled');
  const nextEnabled = safe.enabled;
  delete safe.enabled;
  store.saveSettings(safe);
  if (hasEnabled && nextEnabled !== store.getSettings().enabled) {
    await setMonitoringEnabled(nextEnabled);
  }
  startClipboardWatcher();
  applyAutoLaunch();
  registerAllShortcuts();
  if (tray) tray.setContextMenu(buildTrayMenu());
});

ipcMain.handle('settings:save-shortcuts', (_event, shortcuts) => {
  store.saveSettings({ shortcuts });
  registerAllShortcuts();
  if (tray) tray.setContextMenu(buildTrayMenu());
  return shortcutStatus;
});

ipcMain.handle('settings:reset-shortcuts', () => {
  store.saveSettings({ shortcuts: DEFAULT_SHORTCUTS });
  registerAllShortcuts();
  if (tray) tray.setContextMenu(buildTrayMenu());
  return shortcutStatus;
});

// --- IPC: auto-tag rules (keyword-based tags on clipboard history items) ---

ipcMain.handle('settings:get-tag-rules', () => store.getTagRules());
ipcMain.handle('settings:save-tag-rules', (_event, rules) => store.saveTagRules(rules));

// --- IPC: custom action rules (user-defined pattern -> URL detectors) ---

ipcMain.handle('settings:get-custom-rules', () => store.getCustomActionRules());
// Validates every rule first (invalid regex, catastrophic backtracking, bad URL template). On any problem
// nothing is saved and the problems come back as { index, code } so the UI can say what to fix.
ipcMain.handle('settings:save-custom-rules', (_event, rules) => {
  const list = Array.isArray(rules) ? rules : [];
  const problems = [];
  list.forEach((r, index) => {
    if (!r || !(r.label || r.pattern || r.urlTemplate)) return;
    const res = validateRule({ pattern: String(r.pattern || '').trim(), urlTemplate: r.urlTemplate });
    if (!res.ok) problems.push({ index, code: res.code });
  });
  if (problems.length) return { ok: false, problems };
  return { ok: true, rules: store.saveCustomActionRules(list) };
});

ipcMain.handle('settings:get-history', () => store.getHistory());
ipcMain.on('settings:clear-history', () => store.clearHistory());
ipcMain.on('settings:clear-clipboard-history', () => {
  store.clearClipboardHistory();
  broadcastHistoryItemsChanged();
  refreshHistorySummaries();
});

function csvEscape(value) {
  const s = String(value == null ? '' : value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildHistoryCsv(history) {
  const locale = store.getSettings().language === 'he' ? 'he-IL' : 'en-US';
  const header = [tr('csv.header.number'), tr('csv.header.name'), tr('csv.header.template'), tr('csv.header.datetime')];
  const rows = history.map((h) => [
    h.display || h.normalized,
    h.name || '',
    h.templateLabel || '',
    new Date(h.sentAt).toLocaleString(locale)
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

ipcMain.handle('settings:export-history-csv', async () => {
  const win = settingsWindow || BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: tr('dialog.export.sendHistory'),
    defaultPath: `tapact-history-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { canceled: true };

  const csv = '﻿' + buildHistoryCsv(store.getHistory()); // BOM so Excel reads Hebrew correctly
  fs.writeFileSync(filePath, csv, 'utf8');
  return { canceled: false, filePath };
});

function buildLeadHistoryCsv(history) {
  const locale = store.getSettings().language === 'he' ? 'he-IL' : 'en-US';
  const header = [tr('csv.header.name'), tr('csv.header.phone'), tr('csv.header.role'), tr('csv.header.source'), tr('csv.header.channel'), tr('csv.header.datetime')];
  const rows = history.map((h) => [
    h.name || '', h.phone || '', h.role || '', h.source || '',
    h.channel || '', new Date(h.sentAt).toLocaleString(locale)
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

ipcMain.handle('settings:export-lead-history-csv', async () => {
  const win = settingsWindow || BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: tr('dialog.export.leadHistory'),
    defaultPath: `tapact-leads-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  const csv = '﻿' + buildLeadHistoryCsv(store.getLeadHistory());
  fs.writeFileSync(filePath, csv, 'utf8');
  return { canceled: false, filePath };
});

// Bundles a single .zip for support/self-diagnosis (Settings ▸ About ▸
// "ייצוא אבחון"): the log file, version.json, a redacted settings snapshot
// (see lib/diagnostics.js for exactly what's stripped - no clipboard
// content, no message templates, no webhook/API secrets, no phone/email),
// and a small system-info.txt. Built entirely in memory with the
// dependency-free zip-writer (electron-builder/archiver/yazl are
// devDependencies only, not present in the packaged app at runtime) and
// written out in one go, so there's never a partially-written temp
// directory to clean up.
ipcMain.handle('settings:export-diagnostics', async () => {
  const win = settingsWindow || BrowserWindow.getFocusedWindow();
  const today = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: tr('dialog.export.diagnostics'),
    defaultPath: `TapAct-Diagnostics-${APP_VERSION}-${today}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  });
  if (canceled || !filePath) return { canceled: true };

  try {
    const files = [];

    // 1) Log file - best-effort, may not exist yet on a very fresh install.
    try {
      const logsDir = path.join(app.getPath('userData'), '..', 'TapAct', 'logs');
      const logFile = path.join(logsDir, 'tapact.log');
      if (fs.existsSync(logFile)) {
        files.push({ name: 'tapact.log', content: fs.readFileSync(logFile) });
      }
    } catch (err) {
      log(LOG_LEVELS.WARN, 'TapAct: diagnostics export could not read the log file.', { message: err?.message });
    }

    // 2) version.json as shipped.
    files.push({ name: 'version.json', content: JSON.stringify({ version: APP_VERSION, buildDate: APP_BUILD_DATE || '' }, null, 2) });

    // 3) Redacted settings snapshot - structural/technical only, see
    // lib/diagnostics.js's field lists for exactly what's excluded.
    const snapshot = buildRedactedSettingsSnapshot({
      settings: store.getSettings(),
      leadSettings: store.getLeadSettings(),
      templates: store.getTemplates(),
      history: store.getHistory(),
      clipboardHistory: store.getClipboardHistory(),
      leadHistory: store.getLeadHistory(),
      tagRules: store.getTagRules(),
      customActionRules: store.getCustomActionRules()
    });
    files.push({ name: 'settings-redacted.json', content: JSON.stringify(snapshot, null, 2) });

    // 4) system-info.txt
    const sysInfoText = buildSystemInfoText({
      osType: `${os.type()} ${os.release()}`.trim(),
      osRelease: os.release(),
      osArch: os.arch(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      appVersion: APP_VERSION,
      buildDate: APP_BUILD_DATE || '',
      installPath: app.getAppPath()
    });
    files.push({ name: 'system-info.txt', content: sysInfoText });

    const zipBuffer = createZip(files);
    fs.writeFileSync(filePath, zipBuffer);
    log(LOG_LEVELS.INFO, 'TapAct: diagnostics bundle exported.', { filePath });
    return { canceled: false, filePath };
  } catch (err) {
    log(LOG_LEVELS.ERROR, 'TapAct: diagnostics export failed.', { message: err?.message });
    return { canceled: false, error: err?.message || String(err) };
  }
});

// Sets Windows' Startup-at-login entry to match Settings ▸ "הפעלה אוטומטית
// עם Windows", then reads it back via getLoginItemSettings() to confirm it
// actually took (round-trip verification instead of trusting the write
// blindly). Called on every app startup and every settings save, which is
// also what makes this self-healing: if the user (or Windows itself, e.g.
// via Task Manager's Startup tab, or a clean like a Windows reset) removes
// the registry entry behind the app's back, the next launch or settings
// save re-applies the stored preference rather than silently drifting out
// of sync with what Settings shows.
function applyAutoLaunch() {
  if (process.platform === 'linux') return; // not supported by Electron on Linux
  const { autoLaunch } = store.getSettings();
  app.setLoginItemSettings({ openAtLogin: autoLaunch, path: process.execPath });
  try {
    const actual = app.getLoginItemSettings({ path: process.execPath }).openAtLogin;
    if (autoLaunchNeedsReconcile({ desired: autoLaunch, actualOpenAtLogin: actual })) {
      // One retry - covers a transient failure (e.g. AV/policy blocking the
      // registry write on the first attempt). If it still doesn't match
      // after this, it's logged so it's visible in the log file rather than
      // failing silently; Settings still reflects what the user asked for.
      app.setLoginItemSettings({ openAtLogin: autoLaunch, path: process.execPath });
      const reconfirmed = app.getLoginItemSettings({ path: process.execPath }).openAtLogin;
      if (autoLaunchNeedsReconcile({ desired: autoLaunch, actualOpenAtLogin: reconfirmed })) {
        log(LOG_LEVELS.WARN, 'TapAct: Windows Startup entry did not match the saved autoLaunch setting after retry.', { desired: autoLaunch, actual: reconfirmed });
      } else {
        log(LOG_LEVELS.INFO, 'TapAct: Windows Startup entry re-applied to match saved setting.', { autoLaunch });
      }
    }
  } catch (err) {
    log(LOG_LEVELS.WARN, 'TapAct: could not read back Windows Startup entry.', { message: err?.message });
  }
}

// --- App lifecycle ---

// Re-registers all three shortcuts from current settings (falling back to
// DEFAULT_SHORTCUTS for anything unset/invalid). Called on startup, after
// Settings saves a new binding, and from the tray's "רענן קיצורים" item -
// that last one matters because registration is a one-time OS grab at the
// moment it's called: if Windows still owned Win+V when the app started
// but the user turns Windows' Clipboard History off *while TapAct is
// already running*, nothing re-tries the grab on its own until this runs
// again.
function registerAllShortcuts() {
  globalShortcut.unregisterAll();
  const configured = { ...DEFAULT_SHORTCUTS, ...(store.getSettings().shortcuts || {}) };

  shortcutStatus.manual = tryRegister(configured.manual, triggerManualPopup);
  shortcutStatus.history = tryRegister(configured.history, openHistoryWindow);
  shortcutStatus.historyFallback = tryRegister(configured.historyFallback, openHistoryWindow);

  if (!shortcutStatus.manual) {
    log(LOG_LEVELS.WARN, `TapAct: could not register global shortcut ${configured.manual} (already taken by another app) - the tray menu item still works.`);
  }
  if (!shortcutStatus.history) {
    // Expected whenever Windows' own Clipboard History (Win+V) is still
    // turned on - Windows holds the shortcut first, so Electron can't grab
    // it. Documented in Settings; the fallback and the tray menu item still
    // work either way.
    log(LOG_LEVELS.WARN, `TapAct: could not register ${configured.history} (likely still owned by Windows' own Clipboard History, or another app - see Settings for how to free it up).`);
  }
  if (!shortcutStatus.historyFallback) {
    log(LOG_LEVELS.WARN, `TapAct: could not register fallback shortcut ${configured.historyFallback} - the tray menu item still works.`);
  }
}

// Defense-in-depth backstop: the Settings UI's shortcut recorder already
// refuses to let Tab/Escape become a saved shortcut value (see
// settings.js's setupShortcutCapture), but this also guards any other path
// that could reach here with one (a hand-edited settings file, a future
// bug) - globalShortcut.register is OS-wide, so letting a bare navigation
// key like this through would intercept it everywhere on the system.
const UNSAFE_BARE_ACCELERATORS = new Set(['Tab', 'Escape']);

function tryRegister(accelerator, handler) {
  if (!accelerator || UNSAFE_BARE_ACCELERATORS.has(accelerator)) return false;
  try {
    return globalShortcut.register(accelerator, handler);
  } catch (err) {
    return false; // malformed accelerator string (e.g. from bad user input)
  }
}

// ---- Auto-update (electron-updater, GitHub Releases provider) ----
// Checks ofirshudari1-ship-it/tapact releases for a newer desktop-agent
// build. Never blocks startup and never throws past this module - a failed
// check (offline, GitHub unreachable, etc.) is logged and otherwise
// ignored, matching this app's existing tray-app failure posture.
autoUpdater.autoDownload = true;
// Whether a downloaded update installs itself automatically the next time
// TapAct quits, vs. just sitting there ready until the user restarts by
// hand. Reads the persisted Settings ▸ About ▸ Updates toggle (default true
// - see store.js's DEFAULT_SETTINGS.autoInstallUpdates for why) instead of
// the previous hardcoded `true`; kept in sync whenever that toggle is saved
// (see the 'settings:save-one' handler below).
autoUpdater.autoInstallOnAppQuit = store.getSettings().autoInstallUpdates !== false;

// Pushes the real autoUpdater state to Settings (if it's open) and persists
// it so "last checked" survives a restart - see store.js's
// getUpdateCheckStatus/setUpdateCheckStatus. Settings pulls the current
// value on open via the 'update:get-status' handler below, then gets live
// pushes while it stays open.
function pushUpdateStatus(status) {
  store.setUpdateCheckStatus(status);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('update:status-changed', store.getUpdateCheckStatus());
  }
}

let promptedUpdateVersion = null;
let periodicUpdateTimer = null;

function runUpdateCheck(reason) {
  try {
    Promise.resolve(autoUpdater.checkForUpdates()).catch((err) => log(LOG_LEVELS.WARN, `autoUpdater ${reason} check rejected`, { message: err?.message }));
  } catch (err) {
    log(LOG_LEVELS.ERROR, `autoUpdater ${reason} check threw`, { message: err?.message });
  }
}

function initAutoUpdater() {
  if (!app.isPackaged) return; // no packaged app.asar / no update feed in dev

  autoUpdater.on('checking-for-update', () => {
    pushUpdateStatus({ state: 'checking', error: null });
  });

  autoUpdater.on('update-available', (info) => {
    pushUpdateStatus({ state: 'downloading', version: info?.version || null, progress: 0, error: null });
  });

  autoUpdater.on('update-not-available', () => {
    pushUpdateStatus({ state: 'up-to-date', version: null, lastCheckedAt: Date.now(), error: null });
  });

  autoUpdater.on('download-progress', (progress) => {
    pushUpdateStatus({ state: 'downloading', progress: Math.round(progress?.percent || 0) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    pushUpdateStatus({ state: 'ready', version: info?.version || null, lastCheckedAt: Date.now(), error: null });
  });

  autoUpdater.on('error', (err) => {
    pushUpdateStatus({ state: 'error', error: err?.message || String(err), lastCheckedAt: Date.now() });
    log(LOG_LEVELS.ERROR, 'autoUpdater error', { message: err?.message || String(err) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log(LOG_LEVELS.INFO, 'autoUpdater update downloaded', { version: info?.version });
    // The periodic check can report the same downloaded version again: ask once per version.
    if (!shouldPromptForVersion(promptedUpdateVersion, info && info.version)) return;
    promptedUpdateVersion = info.version;
    dialog
      .showMessageBox({
        type: 'info',
        title: tr('update.dialog.title'),
        message: tr('update.dialog.message').replace('{version}', info.version),
        // Honest about the installer possibly needing a Windows permission
        // prompt: TapAct's own .exe is already set to run elevated
        // (requireAdministrator - see package.json's build.win config), so
        // in the normal case the update installer inherits that elevation
        // and installs without asking again - but electron-updater falls
        // back to an explicit elevation request (its own UAC prompt) if the
        // direct install attempt hits a permissions error, so this doesn't
        // promise zero prompts.
        detail: tr('update.dialog.detail'),
        buttons: [tr('update.dialog.btn.restart'), tr('update.dialog.btn.later')],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        // Restart now: silent install, and TapAct starts again by itself (no wizard to click through).
        if (response === 0) autoUpdater.quitAndInstall(true, true);
      })
      .catch((err) => log(LOG_LEVELS.ERROR, 'autoUpdater dialog failed', { message: err?.message }));
  });

  // Not checkForUpdatesAndNotify(): that adds its own Windows toast on top of
  // the restart dialog and the Settings status TapAct already shows.
  runUpdateCheck('startup');
  // The app stays up for days: check again every few hours (never forces a restart, no toast).
  if (periodicUpdateTimer) clearInterval(periodicUpdateTimer);
  periodicUpdateTimer = setInterval(() => {
    if (shouldRunPeriodicCheck(store.getUpdateCheckStatus().state)) runUpdateCheck('periodic');
  }, UPDATE_CHECK_INTERVAL_MS);
  if (periodicUpdateTimer.unref) periodicUpdateTimer.unref();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // Another instance already owns the lock (tray icon, clipboard watcher,
  // global shortcuts) - quitting immediately here is what actually
  // prevents duplicates; without this, every launch (auto-start, a second
  // double-click of the installed shortcut, etc.) added its own full
  // instance, each with its own tray icon and clipboard-poll timer.
  app.quit();
} else {
  app.on('second-instance', () => {
    // Something tried to launch a second copy - surface the existing
    // instance's settings window instead of silently doing nothing.
    openSettingsWindow();
  });

  // Catch-all for every quit path, not just the tray's "יציאה" item -
  // autoUpdater.quitAndInstall(), a future Cmd/Alt+Q, etc. all fire
  // 'before-quit' too, and shouldHideToTray needs isQuitting set before any
  // window's 'close' handler runs so it doesn't intercept a real quit.
  app.on('before-quit', () => { isQuitting = true; });

  app.whenReady().then(async () => {
    // Before anything renders text (tray menu, welcome): settle the first-run
    // language now that app.getLocale() is reliable - see store.js.
    store.applyFirstRunLanguage(app.getLocale());
    createTray();
    // Shared/work-PC option: force monitoring off at this specific launch
    // regardless of whatever `enabled` was left at last time, without
    // changing the user's actual saved preference for next time... except it
    // IS the saved preference (there's no separate "session-only" state in
    // this store), so this intentionally persists enabled:false until the
    // user turns monitoring back on themselves - that's the point of
    // "start paused" for a machine other people also use.
    const startupSettings = store.getSettings();
    // One-time (older installs): the date popup fired on every date a rep copied,
    // so it is switched off once. The marker means turning it back on sticks.
    if (!startupSettings.dateDetectorOffApplied) {
      store.saveSettings({ detectors: { datetime: false }, dateDetectorOffApplied: true });
    }
    scheduleSnoozeExpiry();
    if (startupSettings.startPaused && startupSettings.enabled) {
      store.saveSettings({ enabled: false });
    }
    // `lastClipboardText` starts out as '' (see its declaration above) - a
    // cold launch is exactly the "was not running -> about to run" case
    // shouldPrimeClipboardOnResume already models for the pause/resume
    // toggle. Without this, the very first poll tick after launch compared
    // whatever text happened to already be sitting in the OS clipboard
    // (copied in some other app, any time before TapAct even started)
    // against that empty '', always saw it as "new", and popped the action/
    // phone popup (and logged it to history) for content nobody just
    // copied - reported as "the last-copy popup appears just from opening
    // the app". Priming the baseline first, exactly like resuming from
    // pause does, fixes that at the source instead of masking it downstream.
    if (shouldPrimeClipboardOnResume({ wasEnabled: false, willBeEnabled: store.getSettings().enabled })) {
      await primeClipboardBaseline();
    }
    startClipboardWatcher();
    applyAutoLaunch();
    registerAllShortcuts();
    // TapAct always starts in the tray; the first-run welcome guide shows once.
    maybeShowWelcome();
    // Non-blocking; give the tray/clipboard-watcher startup a few seconds
    // to settle before hitting the network.
    setTimeout(initAutoUpdater, 5000);
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}

// Tray app: subscribing here (without calling app.quit()) is what keeps the
// process alive on Windows/Linux once the popup/settings windows close.
app.on('window-all-closed', () => {});
