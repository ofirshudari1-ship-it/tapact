// window-behavior.test.js — tests for src/lib/window-behavior.js, the pure
// helpers behind the tray app's close-to-tray/quit split and auto-launch
// self-heal logic.

const {
  shouldHideToTray,
  shouldShowTrayHideHint,
  autoLaunchNeedsReconcile,
  resolveTrayClickTarget,
  shouldPrimeClipboardOnResume,
  resolveDedupeMs
} = require('../src/lib/window-behavior');

describe('shouldHideToTray', () => {
  test('hides when closeToTray is on, not quitting, and tray exists', () => {
    expect(shouldHideToTray({ closeToTray: true, isQuitting: false, hasTray: true })).toBe(true);
  });

  test('closeToTray defaults on when undefined (only explicit false disables it)', () => {
    expect(shouldHideToTray({ closeToTray: undefined, isQuitting: false, hasTray: true })).toBe(true);
  });

  test('does not hide when closeToTray is explicitly false', () => {
    expect(shouldHideToTray({ closeToTray: false, isQuitting: false, hasTray: true })).toBe(false);
  });

  test('does not hide while an actual quit is in progress — this is the "יציאה" bug fix', () => {
    // Regression guard: before this flag existed, clicking the tray's
    // "יציאה" item while the Settings window was open would hit the same
    // interception as the window's own X button, preventDefault() the
    // window's close, and per Electron's documented behavior that silently
    // cancels app.quit() entirely.
    expect(shouldHideToTray({ closeToTray: true, isQuitting: true, hasTray: true })).toBe(false);
  });

  test('does not hide when there is no tray to hide to', () => {
    expect(shouldHideToTray({ closeToTray: true, isQuitting: false, hasTray: false })).toBe(false);
  });
});

describe('shouldShowTrayHideHint', () => {
  test('shows the hint the first time (hideHintSeen unset)', () => {
    expect(shouldShowTrayHideHint({ hideHintSeen: false })).toBe(true);
    expect(shouldShowTrayHideHint({})).toBe(true);
  });

  test('never shows again once seen', () => {
    expect(shouldShowTrayHideHint({ hideHintSeen: true })).toBe(false);
  });

  test('is independent of the removed tray-notification toggle', () => {
    expect(shouldShowTrayHideHint({ hideHintSeen: false, showTrayNotification: false })).toBe(true);
  });
});

describe('autoLaunchNeedsReconcile', () => {
  test('false when OS state already matches desired state', () => {
    expect(autoLaunchNeedsReconcile({ desired: true, actualOpenAtLogin: true })).toBe(false);
    expect(autoLaunchNeedsReconcile({ desired: false, actualOpenAtLogin: false })).toBe(false);
  });

  test('true when the user (or Windows) removed the Startup entry behind the app\'s back', () => {
    expect(autoLaunchNeedsReconcile({ desired: true, actualOpenAtLogin: false })).toBe(true);
  });

  test('true when the OS has it enabled but the saved setting turned it off', () => {
    expect(autoLaunchNeedsReconcile({ desired: false, actualOpenAtLogin: true })).toBe(true);
  });
});

describe('resolveTrayClickTarget', () => {
  test('maps settings values to their targets', () => {
    expect(resolveTrayClickTarget('history')).toBe('history');
    expect(resolveTrayClickTarget('settings')).toBe('settings');
    expect(resolveTrayClickTarget('none')).toBe('none');
  });

  test('falls back to history for unset/unknown values', () => {
    expect(resolveTrayClickTarget(undefined)).toBe('history');
    expect(resolveTrayClickTarget('bogus')).toBe('history');
  });
});

describe('shouldPrimeClipboardOnResume', () => {
  test('primes only on a paused -> active transition', () => {
    expect(shouldPrimeClipboardOnResume({ wasEnabled: false, willBeEnabled: true })).toBe(true);
  });

  test('does not prime when already active, when pausing, or when staying paused', () => {
    expect(shouldPrimeClipboardOnResume({ wasEnabled: true, willBeEnabled: true })).toBe(false);
    expect(shouldPrimeClipboardOnResume({ wasEnabled: true, willBeEnabled: false })).toBe(false);
    expect(shouldPrimeClipboardOnResume({ wasEnabled: false, willBeEnabled: false })).toBe(false);
  });

  // Regression guard for the "opening the app pops the last-copy popup" bug:
  // a cold app launch is the exact same "was not running -> about to run"
  // shape as resuming from pause (nothing has been polling the clipboard yet,
  // so `lastClipboardText` is still at its unset default) - main.js's
  // app.whenReady() now calls this with wasEnabled: false unconditionally and
  // willBeEnabled taken from the just-loaded settings (after the startPaused
  // override, if any, has already been applied), instead of jumping straight
  // to startClipboardWatcher() with no baseline at all like it used to.
  test('cold start (wasEnabled: false) primes whenever monitoring will be on', () => {
    // Normal launch, monitoring on by default.
    expect(shouldPrimeClipboardOnResume({ wasEnabled: false, willBeEnabled: true })).toBe(true);
    // Shared-PC "start paused" launch: startupSettings.enabled was already
    // forced to false before this check runs, so no priming happens - there
    // is nothing to protect yet since the watcher won't poll at all.
    expect(shouldPrimeClipboardOnResume({ wasEnabled: false, willBeEnabled: false })).toBe(false);
  });
});

describe('resolveDedupeMs', () => {
  test('0 means no cooldown (it used to become 60 seconds)', () => {
    expect(resolveDedupeMs(0)).toBe(0);
  });
  test('seconds are converted to milliseconds', () => {
    expect(resolveDedupeMs(30)).toBe(30000);
    expect(resolveDedupeMs('5')).toBe(5000);
  });
  test('missing or invalid values use the 10s default', () => {
    expect(resolveDedupeMs(undefined)).toBe(10000);
    expect(resolveDedupeMs(null)).toBe(10000);
    expect(resolveDedupeMs('')).toBe(10000);
    expect(resolveDedupeMs('abc')).toBe(10000);
    expect(resolveDedupeMs(-3)).toBe(10000);
  });
});
