const fs = require('fs');
const path = require('path');
const { RULES, resolveField, resolveFields } = require('../src/lib/numeric-fields');
const { sanitizeSettingsPatch } = require('../src/lib/settings-guard');
const { STRINGS } = require('../src/lib/i18n-renderer');

describe('resolveField', () => {
  test('empty input keeps the previous value and reports it', () => {
    expect(resolveField('autoCloseSeconds', '', 7)).toMatchObject({ value: 7, status: 'empty' });
    expect(resolveField('dedupeSeconds', '   ', 60)).toMatchObject({ value: 60, status: 'empty' });
    expect(resolveField('pollMs', undefined, 250)).toMatchObject({ value: 250, status: 'empty' });
  });
  test('empty with no usable previous value falls back to the documented default', () => {
    expect(resolveField('pollMs', '', undefined)).toMatchObject({ value: 250, status: 'empty' });
    expect(resolveField('pollMs', '', null).value).toBe(250);
  });
  test('garbage keeps the previous value', () => {
    expect(resolveField('pollMs', 'abc', 300)).toMatchObject({ value: 300, status: 'invalid' });
  });
  test('0 stays valid where documented (auto-close 0 = never, dedupe 0 = no wait)', () => {
    expect(resolveField('autoCloseSeconds', '0', 7)).toMatchObject({ value: 0, status: 'ok' });
    expect(resolveField('dedupeSeconds', '0', 10)).toMatchObject({ value: 0, status: 'ok' });
    expect(resolveField('sendDedupeMinutes', '0', 30)).toMatchObject({ value: 0, status: 'ok' });
  });
  test('0 is not valid for the poll interval or the auto-run delay: clamped with a notice', () => {
    expect(resolveField('pollMs', '0', 250)).toMatchObject({ value: 200, status: 'clamped', min: 200 });
    expect(resolveField('autoRunDelaySeconds', '0', 4)).toMatchObject({ value: 1, status: 'clamped' });
  });
  test('out of range values are clamped and reported with the allowed range', () => {
    expect(resolveField('autoCloseSeconds', '99999', 7)).toMatchObject({ value: 120, status: 'clamped', min: 0, max: 120 });
    expect(resolveField('dedupeSeconds', '-5', 10)).toMatchObject({ value: 0, status: 'clamped' });
    expect(resolveField('historyStorageLimit', '20', 1000)).toMatchObject({ value: 50, status: 'clamped' });
  });
  test('60 is a legal dedupe value', () => {
    expect(resolveField('dedupeSeconds', '60', 10)).toMatchObject({ value: 60, status: 'ok' });
  });
  test('decimals are rounded silently', () => {
    expect(resolveField('autoCloseSeconds', '7.4', 7)).toMatchObject({ value: 7, status: 'ok' });
  });
  test('the default poll interval is a legal step', () => {
    expect((RULES.pollMs.def - RULES.pollMs.min) % RULES.pollMs.step).toBe(0);
  });
});

describe('resolveFields', () => {
  test('returns values for every field and notices only for the ones that need one', () => {
    const { values, notices } = resolveFields(
      { pollMs: '250', dedupeSeconds: '', autoCloseSeconds: '9999' },
      { pollMs: 250, dedupeSeconds: 10, autoCloseSeconds: 7 }
    );
    expect(values).toEqual({ pollMs: 250, dedupeSeconds: 10, autoCloseSeconds: 120 });
    expect(notices.map((n) => [n.key, n.status])).toEqual([['dedupeSeconds', 'empty'], ['autoCloseSeconds', 'clamped']]);
  });
  test('every range in the UI helper fits inside the IPC guard (the guard never clamps what the UI sends)', () => {
    for (const key of Object.keys(RULES)) {
      const out = sanitizeSettingsPatch({ [key]: RULES[key].min });
      const hi = sanitizeSettingsPatch({ [key]: RULES[key].max });
      expect(out[key]).toBe(RULES[key].min);
      expect(hi[key]).toBe(RULES[key].max);
    }
  });
});

describe('strings for the new messages exist in he and en', () => {
  const keys = ['settings.num.empty', 'settings.num.invalid', 'settings.num.clamped', 'customRules.err.invalid', 'customRules.err.nested',
    'customRules.err.slow', 'customRules.err.tooLong', 'customRules.err.empty', 'customRules.err.badUrl', 'customRules.err.summary'];
  test.each(keys)('%s', (k) => {
    expect(STRINGS.he[k]).toBeTruthy();
    expect(STRINGS.en[k]).toBeTruthy();
    expect(STRINGS.he[k]).not.toMatch(/[–—]/); // plain hyphen only
  });
  test('placeholders are the same in both languages', () => {
    for (const k of ['settings.num.empty', 'settings.num.clamped']) {
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
      expect(ph(STRINGS.he[k])).toBe(ph(STRINGS.en[k]));
    }
  });
  test('poll hint states the real default (250)', () => {
    expect(STRINGS.he['settings.poll.hint']).toMatch(/250/);
    expect(STRINGS.en['settings.poll.hint']).toMatch(/250/);
  });
});

describe('language switching wiring', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'settings', 'settings.js'), 'utf8');
  test('settings:save-one rebuilds the tray when the language changes', () => {
    const handler = main.slice(main.indexOf("ipcMain.handle('settings:save-one'"), main.indexOf("ipcMain.handle('settings:get-data'"));
    expect(handler).toMatch(/hasOwnProperty\.call\(safe, 'language'\)\) refreshTray\(\)/);
  });
  test('the settings window updates settings.language when the language is applied', () => {
    const fn = settingsJs.slice(settingsJs.indexOf('function applyAppLanguage'), settingsJs.indexOf('function applyAppTheme'));
    expect(fn).toMatch(/settings\.language = lang/);
    expect(fn).toMatch(/renderShortcuts\(lastShortcutStatus\)/);
  });
});
