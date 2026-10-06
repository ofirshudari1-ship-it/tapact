// popup-policy.js - pure decisions about WHEN an automatic popup may open.
// No Electron, no timers of its own (callers pass `now`), so every rule is
// unit-tested. Manual triggers (shortcut / tray) never go through this file:
// they always show.

const PHONE_MAX_CHARS = 40;          // "just a phone number" - short text
const PHONE_DIGIT_RATIO = 0.6;       // ...or mostly digits, up to the cap below
const PHONE_DIGIT_RATIO_MAX_CHARS = 100;

// Longest copy that still looks like "the thing itself" per detector type.
// Anything longer is a paragraph that merely contains a link / address / etc.
const TYPE_MAX_CHARS = {
  tracking: 60,
  url: 300,
  address: 150,
  email: 100,
  custom: 200,
  datetime: 60
};

const BURST_MAX_POPUPS = 3;
const BURST_WINDOW_MS = 20 * 1000;
const BURST_PAUSE_MS = 60 * 1000;

function countDigits(s) {
  const m = String(s || '').match(/\d/g);
  return m ? m.length : 0;
}

// True when the clipboard is essentially just a phone number (the phone
// candidate is the main content), i.e. the rep copied a number to call it.
function isPhoneIntent(text, phone) {
  if (!phone) return false;
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length <= PHONE_MAX_CHARS) return true;
  if (t.length > PHONE_DIGIT_RATIO_MAX_CHARS) return false;
  const nonSpace = t.replace(/\s/g, '').length;
  if (!nonSpace) return false;
  return countDigits(t) / nonSpace >= PHONE_DIGIT_RATIO;
}

// Reasonable per-type length cap for generic detectors (not phone).
function withinTypeLengthCap(type, text) {
  const cap = TYPE_MAX_CHARS[type];
  if (!cap) return true;
  return String(text || '').trim().length <= cap;
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  return (parseInt(m[1], 10) % 24) * 60 + (parseInt(m[2], 10) % 60);
}

// Quiet hours window, overnight ranges (18:00 -> 08:00) included.
function isQuietHours(qh, date) {
  if (!qh || !qh.enabled) return false;
  const start = toMinutes(qh.start);
  const end = toMinutes(qh.end);
  if (start == null || end == null || start === end) return false;
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const nowMin = d.getHours() * 60 + d.getMinutes();
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

// --- Snooze ---

// 'm15' | 'h1' | 'tomorrow' -> absolute timestamp (ms). 'tomorrow' is 08:00
// local time on the next calendar day.
function computeSnoozeUntil(kind, now = Date.now(), tomorrowHour = 8) {
  if (kind === 'm15') return now + 15 * 60 * 1000;
  if (kind === 'h1') return now + 60 * 60 * 1000;
  if (kind === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(tomorrowHour, 0, 0, 0);
    return d.getTime();
  }
  return 0;
}

function isSnoozed(snoozeUntil, now = Date.now()) {
  return Number.isFinite(snoozeUntil) && snoozeUntil > now;
}

// Expired or invalid snooze collapses to 0 (the caller persists that, so the
// stored value auto-clears instead of lingering).
function normalizeSnooze(snoozeUntil, now = Date.now()) {
  return isSnoozed(snoozeUntil, now) ? snoozeUntil : 0;
}

// --- Burst guard ---
// Copying a column of numbers would open a popup per cell. After
// BURST_MAX_POPUPS popups within BURST_WINDOW_MS, further automatic popups are
// suppressed for BURST_PAUSE_MS. The popup that trips the limit still opens
// (flagged) so it can tell the user what is happening.
function createBurstGuard({ maxPopups = BURST_MAX_POPUPS, windowMs = BURST_WINDOW_MS, pauseMs = BURST_PAUSE_MS } = {}) {
  let opens = [];
  let pausedUntil = 0;
  return {
    isPaused(now) { return now < pausedUntil; },
    pausedUntil() { return pausedUntil; },
    // Call when an automatic popup actually opens. Returns { paused } where
    // paused === true means THIS popup is the one that tripped the guard.
    recordOpen(now) {
      opens = opens.filter((t) => now - t < windowMs);
      opens.push(now);
      if (opens.length >= maxPopups) {
        pausedUntil = now + pauseMs;
        opens = [];
        return { paused: true, until: pausedUntil };
      }
      return { paused: false, until: 0 };
    },
    reset() { opens = []; pausedUntil = 0; }
  };
}

// Single decision for an AUTOMATIC popup.
// input: {
//   type: 'phone'|'tracking'|'address'|'url'|'email'|'custom'|'datetime',
//   text, phone (phone match or null),
//   detectorEnabled (bool), ownWindowFocused (bool), snoozeUntil, quiet (bool),
//   burstPaused (bool), now
// }
// -> { show: boolean, reason: string }
function decideAutoPopup(input) {
  const { type, text, phone, detectorEnabled, ownWindowFocused, snoozeUntil, quiet, burstPaused, now } = input;
  if (detectorEnabled === false) return { show: false, reason: 'detector-off' };
  if (ownWindowFocused) return { show: false, reason: 'own-window' };
  if (type === 'phone') {
    if (!isPhoneIntent(text, phone)) return { show: false, reason: 'not-phone-intent' };
  } else if (!withinTypeLengthCap(type, text)) {
    return { show: false, reason: 'too-long' };
  }
  if (quiet) return { show: false, reason: 'quiet-hours' };
  if (isSnoozed(snoozeUntil, now)) return { show: false, reason: 'snoozed' };
  if (burstPaused) return { show: false, reason: 'burst' };
  return { show: true, reason: 'ok' };
}

module.exports = {
  PHONE_MAX_CHARS, TYPE_MAX_CHARS, BURST_MAX_POPUPS, BURST_WINDOW_MS, BURST_PAUSE_MS,
  isPhoneIntent, withinTypeLengthCap, isQuietHours, computeSnoozeUntil, isSnoozed,
  normalizeSnooze, createBurstGuard, decideAutoPopup
};
