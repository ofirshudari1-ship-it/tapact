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
// meanings of 'close' can create. Never nags again once seen, and is itself
// gated by the existing showTrayNotification toggle (Settings already lets
// the user opt out of all tray balloons).
function shouldShowTrayHideHint({ hideHintSeen, showTrayNotification }) {
  return hideHintSeen !== true && showTrayNotification !== false;
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

// Anchors a popup ABOVE a screen point (the cursor / copy location) instead
// of overlapping it - the popup used to open at cursor+gap,+gap (down-right
// of the point), which meant it visually sat right on top of the text that
// was just copied/selected. `gap` is the vertical clearance kept between the
// point and the popup's bottom edge. Falls back to below the point when
// there isn't enough room above it (e.g. the copy happened near the top of
// the screen), and is always clamped to stay fully inside `workArea` on
// every axis so it never renders off-screen on a small/scaled display.
function computeAnchoredPopupPosition({ point, width, height, workArea, gap = 10 }) {
  const bounds = workArea || { x: 0, y: 0, width: 0, height: 0 };
  let x = point.x - Math.round(width / 2);
  let y = point.y - height - gap;
  if (y < bounds.y) y = point.y + gap; // not enough room above - open below instead
  x = Math.min(Math.max(x, bounds.x), bounds.x + bounds.width - width);
  y = Math.min(Math.max(y, bounds.y), bounds.y + bounds.height - height);
  return { x, y };
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
  computeAnchoredPopupPosition,
  shouldPrimeClipboardOnResume
};
