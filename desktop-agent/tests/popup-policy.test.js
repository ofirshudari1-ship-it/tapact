const {
  isPhoneIntent, withinTypeLengthCap, isQuietHours, computeSnoozeUntil, isSnoozed, normalizeSnooze,
  createBurstGuard, decideAutoPopup, BURST_PAUSE_MS
} = require('../src/lib/popup-policy');

const PHONE = { raw: '050-1234567', normalized: '972501234567', display: '050-123-4567' };

describe('isPhoneIntent', () => {
  test('a bare number is a call intent', () => {
    expect(isPhoneIntent('050-1234567', PHONE)).toBe(true);
    expect(isPhoneIntent('  +972 50 123 4567 \n', PHONE)).toBe(true);
  });
  test('a name plus a number (short) still counts', () => {
    expect(isPhoneIntent('דני כהן 050-1234567', PHONE)).toBe(true);
  });
  test('a long block of text that happens to contain a number is not', () => {
    const para = 'שלום, אשמח שתחזרו אליי בהקדם בנוגע להצעת המחיר שקיבלתי אתמול. הטלפון שלי 050-1234567 ואפשר גם במייל.';
    expect(isPhoneIntent(para, PHONE)).toBe(false);
  });
  test('mostly digits within the cap counts even when longer than 40 chars', () => {
    expect(isPhoneIntent('050-1234567 / 052-7654321 / 054-1112223', PHONE)).toBe(true);
    const digits = '0501234567 0521234567 0541234567 0531234567';
    expect(isPhoneIntent(digits, PHONE)).toBe(true);
  });
  test('over the hard cap is never a call intent', () => {
    expect(isPhoneIntent('1'.repeat(150), PHONE)).toBe(false);
  });
  test('no phone or empty text', () => {
    expect(isPhoneIntent('050-1234567', null)).toBe(false);
    expect(isPhoneIntent('   ', PHONE)).toBe(false);
  });
});

describe('withinTypeLengthCap', () => {
  test('caps per type', () => {
    expect(withinTypeLengthCap('url', 'https://example.com/' + 'a'.repeat(100))).toBe(true);
    expect(withinTypeLengthCap('url', 'x'.repeat(400))).toBe(false);
    expect(withinTypeLengthCap('tracking', 'RR123456789IL')).toBe(true);
    expect(withinTypeLengthCap('tracking', 'x'.repeat(80))).toBe(false);
    expect(withinTypeLengthCap('address', 'x'.repeat(200))).toBe(false);
    expect(withinTypeLengthCap('email', 'a@b.co')).toBe(true);
    expect(withinTypeLengthCap('unknown-type', 'x'.repeat(1000))).toBe(true);
  });
});

describe('isQuietHours', () => {
  const at = (h, m) => new Date(2026, 9, 6, h, m, 0);
  test('disabled or invalid never quiet', () => {
    expect(isQuietHours({ enabled: false, start: '18:00', end: '08:00' }, at(23, 0))).toBe(false);
    expect(isQuietHours({ enabled: true, start: 'x', end: '08:00' }, at(23, 0))).toBe(false);
    expect(isQuietHours({ enabled: true, start: '08:00', end: '08:00' }, at(9, 0))).toBe(false);
  });
  test('same-day and overnight windows', () => {
    expect(isQuietHours({ enabled: true, start: '12:00', end: '13:00' }, at(12, 30))).toBe(true);
    expect(isQuietHours({ enabled: true, start: '12:00', end: '13:00' }, at(13, 0))).toBe(false);
    const night = { enabled: true, start: '18:00', end: '08:00' };
    expect(isQuietHours(night, at(23, 0))).toBe(true);
    expect(isQuietHours(night, at(7, 59))).toBe(true);
    expect(isQuietHours(night, at(8, 0))).toBe(false);
    expect(isQuietHours(night, at(12, 0))).toBe(false);
  });
});

describe('snooze', () => {
  const now = new Date(2026, 9, 6, 14, 30, 0).getTime();
  test('15 minutes and 1 hour', () => {
    expect(computeSnoozeUntil('m15', now)).toBe(now + 15 * 60000);
    expect(computeSnoozeUntil('h1', now)).toBe(now + 3600000);
  });
  test('tomorrow is 08:00 local on the next day', () => {
    const t = new Date(computeSnoozeUntil('tomorrow', now));
    expect(t.getDate()).toBe(7);
    expect(t.getHours()).toBe(8);
    expect(t.getMinutes()).toBe(0);
  });
  test('tomorrow from after midnight is still the next calendar day', () => {
    const late = new Date(2026, 9, 6, 1, 0, 0).getTime();
    expect(new Date(computeSnoozeUntil('tomorrow', late)).getDate()).toBe(7);
  });
  test('month end rolls over', () => {
    const eom = new Date(2026, 9, 31, 20, 0, 0).getTime();
    const t = new Date(computeSnoozeUntil('tomorrow', eom));
    expect(t.getMonth()).toBe(10);
    expect(t.getDate()).toBe(1);
  });
  test('unknown kind gives 0', () => {
    expect(computeSnoozeUntil('nope', now)).toBe(0);
  });
  test('expiry: active until the timestamp, then auto-clears to 0', () => {
    const until = now + 1000;
    expect(isSnoozed(until, now)).toBe(true);
    expect(isSnoozed(until, until)).toBe(false);
    expect(normalizeSnooze(until, now)).toBe(until);
    expect(normalizeSnooze(until, until + 1)).toBe(0);
    expect(normalizeSnooze(undefined, now)).toBe(0);
    expect(normalizeSnooze('abc', now)).toBe(0);
    expect(normalizeSnooze(NaN, now)).toBe(0);
  });
});

describe('burst guard', () => {
  test('trips on the 3rd popup within 20s and pauses for 60s', () => {
    const g = createBurstGuard();
    expect(g.recordOpen(0).paused).toBe(false);
    expect(g.recordOpen(5000).paused).toBe(false);
    const third = g.recordOpen(10000);
    expect(third.paused).toBe(true);
    expect(g.isPaused(10001)).toBe(true);
    expect(g.isPaused(10000 + BURST_PAUSE_MS - 1)).toBe(true);
    expect(g.isPaused(10000 + BURST_PAUSE_MS)).toBe(false);
  });
  test('slow copying never trips it', () => {
    const g = createBurstGuard();
    for (let i = 0; i < 10; i++) expect(g.recordOpen(i * 15000).paused).toBe(false);
    expect(g.isPaused(150000)).toBe(false);
  });
  test('starts counting fresh after a pause', () => {
    const g = createBurstGuard();
    g.recordOpen(0); g.recordOpen(1000); g.recordOpen(2000);
    expect(g.recordOpen(70000).paused).toBe(false);
  });
  test('reset clears everything', () => {
    const g = createBurstGuard();
    g.recordOpen(0); g.recordOpen(1); g.recordOpen(2);
    g.reset();
    expect(g.isPaused(3)).toBe(false);
  });
});

describe('decideAutoPopup', () => {
  const base = { type: 'phone', text: '050-1234567', phone: PHONE, detectorEnabled: true, ownWindowFocused: false, snoozeUntil: 0, quiet: false, burstPaused: false, now: 1000 };
  test('plain phone copy shows', () => {
    expect(decideAutoPopup(base)).toEqual({ show: true, reason: 'ok' });
  });
  test('each suppression reason', () => {
    expect(decideAutoPopup({ ...base, detectorEnabled: false }).reason).toBe('detector-off');
    expect(decideAutoPopup({ ...base, ownWindowFocused: true }).reason).toBe('own-window');
    expect(decideAutoPopup({ ...base, text: 'x'.repeat(60) + ' 050-1234567 ' + 'y'.repeat(60) }).reason).toBe('not-phone-intent');
    expect(decideAutoPopup({ ...base, quiet: true }).reason).toBe('quiet-hours');
    expect(decideAutoPopup({ ...base, snoozeUntil: 5000 }).reason).toBe('snoozed');
    expect(decideAutoPopup({ ...base, burstPaused: true }).reason).toBe('burst');
  });
  test('expired snooze does not suppress', () => {
    expect(decideAutoPopup({ ...base, snoozeUntil: 500 }).show).toBe(true);
  });
  test('generic type over its cap is too long', () => {
    expect(decideAutoPopup({ ...base, type: 'url', phone: null, text: 'https://x.co/' + 'a'.repeat(400) }).reason).toBe('too-long');
    expect(decideAutoPopup({ ...base, type: 'url', phone: null, text: 'https://x.co/a' }).show).toBe(true);
  });
});
