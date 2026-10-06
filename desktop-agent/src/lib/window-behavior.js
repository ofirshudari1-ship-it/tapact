// window-behavior.js — small pure helpers for the tray-app close/quit and
// auto-launch decisions in main.js. Kept side-effect-free and separate from
// main.js so they're unit-testable without mocking Electron's Tray/
// BrowserWindow/app APIs.

// Decides whether a window's 'close' event should be intercepted (hidden to
// tray) instead of allowed to actually close/destroy the window.
//
// The critical bit is `isQuitting`: Electron's app.quit() closes every open
// BrowserWindow by firing its 'close' event, exactly like the user clicking
// the window's own X button. If a window's close handler unconditionally
// calls event.preventDefault() whenever closeToTray is on, then clicking
// "Exit" in the tray menu (which calls app.quit()) would hit that same
// handler, prevent the window from closing, and per Electron's documented
// behavior that cancels the whole quit — "Exit" would silently do nothing
// while the Settings window is open. Callers must set `isQuitting = true`
// before calling app.quit() (and in a 'before-quit' handler, as a catch-all
// for other quit paths like autoUpdater.quitAndInstall()) so this returns
// false during an actual quit, letting the window close for real.
function shouldHideToTray({ closeToTray, isQuitting, hasTray }) {
  return closeToTray !== false && !isQuitting && !!hasTray;
}

// One-time explainer: the first time a window is hidden (not closed) to the
// tray, show a tray balloon so the user isn't left wondering where the app
// went — this directly targets the "confusing scenario" this app's two
// meanings of 'close' can create. Never nags again once seen (internal
// trayHideHintSeen flag; it is not tied to any user setting and is never
// triggered by copying).
function shouldShowTrayHideHint({ hideHintSeen }) {
  return hideHintSeen !== true;
}

// True when the OS's actual login-item state doesn't match what the user
// asked for in Settings (e.g. the user or Windows removed the Startup entry
// by hand outside the app). Used to log + re-apply ("self-heal") rather than
// silently trusting the value written on the last save.
function autoLaunchNeedsReconcile({ desired, actualOpenAtLogin }) {
  return !!desired !== !!actualOpenAtLogin;
}

// Tray icon left-click routing. `action` is the settings.trayClickAction
// value ('history' | 'settings' | 'none' | anything else falls back to
// 'history', the historical/default behavior of a single click doing
// nothing useful being worse than opening the most commonly-needed panel).
function resolveTrayClickTarget(action) {
  if (action === 'settings') return 'settings';
  if (action === 'none') return 'none';
  return 'history';
}

// Resuming monitoring must not retroactively capture whatever was copied
// while it was paused (the whole point of pausing - e.g. to copy a password
// or anything private). The poll loop skips reading the clipboard entirely
// while paused, so without a fresh baseline the first tick after resume
// would see "new" text and log it to the on-disk history / pop a popup for
// it. True exactly on a paused -> active transition.
function shouldPrimeClipboardOnResume({ wasEnabled, willBeEnabled }) {
  return wasEnabled === false && willBeEnabled === true;
}

// Cooldown before the same detected value (phone / link / address...) can
// open a popup again. Settings allows 0 = no cooldown; the old inline
// `(dedupeSeconds || 60)` silently turned 0 into 60 seconds. Missing or
// invalid values fall back to the default (10s, see store DEFAULT_SETTINGS).
function resolveDedupeMs(dedupeSeconds, fallbackSeconds = 10) {
  const n = Number(dedupeSeconds);
  if (dedupeSeconds === null || dedupeSeconds === undefined || dedupeSeconds === '' || !Number.isFinite(n) || n < 0) return fallbackSeconds * 1000;
  return Math.round(n * 1000);
}

module.exports = {
  resolveDedupeMs,
  shouldHideToTray,
  shouldShowTrayHideHint,
  autoLaunchNeedsReconcile,
  resolveTrayClickTarget,
  shouldPrimeClipboardOnResume
};
