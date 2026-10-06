const { safeMatch, validatePattern, hasNestedQuantifier, slowPatterns } = require('../src/lib/safe-regex');
const { isAllowedExternalUrl, sanitizeStoredActions } = require('../src/lib/safe-url');
const { findCustomAction, validateRule } = require('../src/lib/detectors/custom');

describe('safeMatch - hard time budget', () => {
  test('the pathological (a+)+$ pattern on 28 chars returns quickly instead of freezing', () => {
    slowPatterns.clear();
    const t0 = Date.now();
    const r = safeMatch('(a+)+$', 'a'.repeat(28) + 'b');
    const took = Date.now() - t0;
    expect(r).toBeNull();
    expect(took).toBeLessThan(500); // unguarded this takes ~4 seconds
  });
  test('a pattern that timed out is skipped afterwards (costs nothing)', () => {
    const t0 = Date.now();
    expect(safeMatch('(a+)+$', 'a'.repeat(28) + 'b')).toBeNull();
    expect(Date.now() - t0).toBeLessThan(20);
  });
  test('normal patterns still match and return capture groups', () => {
    expect(safeMatch('ORD-(\\d{6})', 'see ORD-123456 ok')).toEqual(['ORD-123456', '123456']);
    expect(safeMatch('ORD-(\\d{6})', 'nothing')).toBeNull();
  });
  test('text is capped at 500 characters', () => {
    expect(safeMatch('END', 'x'.repeat(600) + 'END')).toBeNull();
    expect(safeMatch('END', 'x'.repeat(100) + 'END')).not.toBeNull();
  });
  test('invalid input never throws', () => {
    expect(safeMatch('(', 'abc')).toBeNull();
    expect(safeMatch(null, 'abc')).toBeNull();
    expect(safeMatch('a', null)).toBeNull();
  });
});

describe('validatePattern', () => {
  test.each(['(a+)+$', '(.*)*x', '(\\d+\\s?)*$', '([a-z]+)*$', '(x+x+)+y', '^(\\w+\\s?)*$'])('rejects nested quantifier %s', (p) => {
    expect(validatePattern(p)).toEqual({ ok: false, code: 'nested' });
  });
  test('rejects an overlapping-alternation pattern by dry run', () => {
    expect(validatePattern('^(a|aa)+$')).toEqual({ ok: false, code: 'slow' });
  });
  test('rejects invalid regex, empty and too long', () => {
    expect(validatePattern('(')).toEqual({ ok: false, code: 'invalid' });
    expect(validatePattern('   ')).toEqual({ ok: false, code: 'empty' });
    expect(validatePattern('a'.repeat(201))).toEqual({ ok: false, code: 'too-long' });
  });
  test.each(['ORD-(\\d{6})', '[A-Z]{2}\\d{9}IL', '(?:RR|CP)(\\d+)', '\\b\\d{8}\\b', '(\\d{3})+'])('accepts normal pattern %s', (p) => {
    expect(validatePattern(p)).toEqual({ ok: true });
  });
  test('hasNestedQuantifier ignores brackets inside classes and escapes', () => {
    expect(hasNestedQuantifier('[(a+)]+')).toBe(false);
    expect(hasNestedQuantifier('\\(a+\\)+')).toBe(false);
  });
});

describe('validateRule / findCustomAction with a bad rule', () => {
  const bad = { id: 'x', label: 'bad', pattern: '(a+)+$', urlTemplate: 'https://e.example/{value}' };
  test('validateRule flags catastrophic pattern and non-http templates', () => {
    expect(validateRule(bad).code).toBe('nested');
    expect(validateRule({ pattern: 'ORD-\\d+', urlTemplate: 'javascript:alert(1)' }).code).toBe('bad-url');
    expect(validateRule({ pattern: 'ORD-\\d+', urlTemplate: 'https://e.example/{value}' })).toEqual({ ok: true });
  });
  test('even if a bad rule was saved earlier, matching never blocks', () => {
    const t0 = Date.now();
    expect(findCustomAction('a'.repeat(28) + 'b', [bad], 'en')).toBeNull();
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('isAllowedExternalUrl - one scheme allowlist', () => {
  test.each([
    'https://www.google.com/maps/search/?api=1&query=x', 'http://example.com', 'mailto:a@b.co', 'tel:+972501234567',
    'whatsapp://send?phone=972501234567', 'HTTPS://EXAMPLE.COM', 'https://web.whatsapp.com/send?phone=1'
  ])('allows %s', (u) => expect(isAllowedExternalUrl(u)).toBe(true));
  test.each([
    'file:///C:/Windows/System32/calc.exe', 'ms-msdt:/id PCWDiagnostic', 'javascript:alert(1)', 'data:text/html,hi', 'vbscript:x',
    'search-ms:query=a', 'ms-settings:network', 'steam://run/1', 'C:\\Windows\\notepad.exe', '\\\\server\\share', 'calc.exe',
    '', null, undefined, 42, ' file:///x', 'https://a.b/\nfile:///x', 'x'.repeat(9000)
  ])('refuses %p', (u) => expect(isAllowedExternalUrl(u)).toBe(false));
});

describe('sanitizeStoredActions', () => {
  test('drops actions with other schemes, keeps allowed ones', () => {
    const out = sanitizeStoredActions([
      { label: 'bad', url: 'file:///C:/x.exe' },
      { label: 'bad2', url: 'ms-msdt:/id x' },
      { label: 'ok', url: 'https://example.com/a' },
      { label: 'wa', wa: '972501234567', url: 'https://wa.me/972501234567' }
    ]);
    expect(out.map((a) => a.label)).toEqual(['ok', 'wa']);
  });
  test('returns null when nothing survives or input is not an array', () => {
    expect(sanitizeStoredActions([{ label: 'x', url: 'javascript:1' }])).toBeNull();
    expect(sanitizeStoredActions('x')).toBeNull();
    expect(sanitizeStoredActions(null)).toBeNull();
  });
  test('a wa value that is not a phone number is dropped', () => {
    expect(sanitizeStoredActions([{ label: 'x', wa: '1&text=EVIL' }])).toBeNull();
  });
});
