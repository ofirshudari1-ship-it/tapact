// i18n tables: he/en parity and the Hebrew copy rules (STANDARDS §20.5).
const { STRINGS, t } = require('../src/lib/i18n-renderer');

describe('i18n tables', () => {
  const he = Object.keys(STRINGS.he);
  const en = Object.keys(STRINGS.en);

  test('every Hebrew key has an English twin and vice versa', () => {
    expect(he.filter((k) => !(k in STRINGS.en))).toEqual([]);
    expect(en.filter((k) => !(k in STRINGS.he))).toEqual([]);
  });

  test('no empty values', () => {
    // A few keys are a leading-space suffix appended to another label.
    const empty = (lang) => Object.entries(STRINGS[lang]).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
    expect(empty('he')).toEqual([]);
    expect(empty('en')).toEqual([]);
  });

  test('Hebrew strings use a regular hyphen, never a long dash', () => {
    expect(Object.entries(STRINGS.he).filter(([, v]) => v.includes('—')).map(([k]) => k)).toEqual([]);
  });

  test('Hebrew strings never use a right-pointing arrow (it points backwards in RTL)', () => {
    expect(Object.entries(STRINGS.he).filter(([, v]) => v.includes('→')).map(([k]) => k)).toEqual([]);
  });

  test('{shortcut} / {n} placeholders exist in both languages', () => {
    const tokens = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
    const mismatched = he.filter((k) => tokens(STRINGS.he[k]) !== tokens(STRINGS.en[k]));
    expect(mismatched).toEqual([]);
  });

  test('t() falls back to the key for unknown keys', () => {
    expect(t('en', 'no.such.key')).toBe('no.such.key');
    expect(t('he', 'welcome.btn.next')).toBe('הבא');
  });
});
