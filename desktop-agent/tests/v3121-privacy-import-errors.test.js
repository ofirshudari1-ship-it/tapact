// v3.12.1: popup gets only a safe view of the lead settings, only the Settings window may read the
// full ones, lead delivery errors are translated, history import reports what it did.
const { buildPopupLeadView, isFromWindow } = require('../src/lib/lead-privacy');
const { localizeLeadResult } = require('../src/lib/lead-delivery');
const { buildImportMessage } = require('../src/lib/import-summary');
const { STRINGS, t } = require('../src/lib/i18n-renderer');
const { buildRedactedSettingsSnapshot, REDACTED } = require('../src/lib/diagnostics');
const fs = require('fs');
const path = require('path');

const FULL = {
  webhookUrl: 'https://hooks.example.com/SECRET-PATH',
  webhookHeaderName: 'Authorization',
  webhookHeaderValue: 'Bearer SECRET-TOKEN',
  channelWebhook: true,
  channelWhatsapp: true,
  whatsappNumber: '972501234567',
  channelEmail: true,
  emailAddress: 'boss@example.com',
  channelSlack: false,
  slackWebhookUrl: 'https://hooks.slack.com/services/T/B/SECRET',
  channelCopy: false,
  messageTemplate: 'name {{name}}',
  aiEnabled: true,
  aiApiKey: 'sk-ant-SECRET',
  customSources: ['Facebook', '', 5, 'Expo'],
  duplicateWindowHours: 12
};

describe('buildPopupLeadView', () => {
  test('exposes exactly the fields the popup needs', () => {
    const view = buildPopupLeadView(FULL);
    expect(Object.keys(view).sort()).toEqual([
      'aiAvailable', 'channelCopy', 'channelEmail', 'channelSlack', 'channelWebhook', 'channelWhatsapp',
      'customSources', 'duplicateWindowHours'
    ]);
    expect(view).toMatchObject({ channelWebhook: true, channelEmail: true, channelSlack: false, aiAvailable: true, duplicateWindowHours: 12 });
    expect(view.customSources).toEqual(['Facebook', 'Expo']);
  });
  test('no secret or personal value survives serialisation', () => {
    const json = JSON.stringify(buildPopupLeadView(FULL));
    for (const secret of ['SECRET', 'boss@example.com', '972501234567', 'name {{name}}', 'Authorization', 'sk-ant']) {
      expect(json).not.toContain(secret);
    }
  });
  test('AI is usable only when enabled AND a key exists', () => {
    expect(buildPopupLeadView({ ...FULL, aiEnabled: false }).aiAvailable).toBe(false);
    expect(buildPopupLeadView({ ...FULL, aiApiKey: '  ' }).aiAvailable).toBe(false);
  });
  test('junk input falls back to safe defaults', () => {
    expect(buildPopupLeadView(null)).toMatchObject({ channelWhatsapp: false, customSources: [], duplicateWindowHours: 6, aiAvailable: false });
    expect(buildPopupLeadView({ duplicateWindowHours: -3 }).duplicateWindowHours).toBe(6);
  });
});

describe('isFromWindow', () => {
  const wc = {};
  const win = { webContents: wc, isDestroyed: () => false };
  test('accepts the window own web contents only', () => {
    expect(isFromWindow({ sender: wc }, win)).toBe(true);
    expect(isFromWindow({ sender: {} }, win)).toBe(false);
  });
  test('rejects missing or destroyed windows and malformed events', () => {
    expect(isFromWindow({ sender: wc }, null)).toBe(false);
    expect(isFromWindow({ sender: wc }, { ...win, isDestroyed: () => true })).toBe(false);
    expect(isFromWindow(null, win)).toBe(false);
    expect(isFromWindow({}, win)).toBe(false);
  });
});

describe('main.js wiring (source check)', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  test('popup init data uses the safe view, not the raw store', () => {
    expect(main).toMatch(/leadSettings: buildPopupLeadView\(store\.getLeadSettings\(\)\)/);
  });
  test('the full lead settings are guarded by the sender check', () => {
    expect(main).toMatch(/'settings:get-lead-settings', \(event\) => \(fromSettingsWindow\(event\)/);
    expect(main).toMatch(/'settings:save-lead-settings', \(event, settings\) => \{\s*if \(!fromSettingsWindow\(event\)\) return;/);
    expect(main).toMatch(/'lead:test-channel', async \(event, \{ channel \}\) => \{\s*if \(!isFromWindow\(event, settingsWindow\)\)/);
  });
  test('popup no longer reads the key or sends leadSettings back', () => {
    const popup = fs.readFileSync(path.join(__dirname, '../src/popup/popup.js'), 'utf8');
    expect(popup).not.toMatch(/aiApiKey/);
    expect(popup).not.toMatch(/sendLeadChannel\(\{[^}]*leadSettings/);
    expect(popup).toMatch(/ls\.aiAvailable/);
  });
});

describe('diagnostics export still redacts every lead secret', () => {
  test('secrets and personal fields are replaced', () => {
    const snap = buildRedactedSettingsSnapshot({ settings: {}, leadSettings: FULL, templates: [], history: [], clipboardHistory: [], leadHistory: [], tagRules: [], customActionRules: [] });
    const json = JSON.stringify(snap);
    for (const secret of ['SECRET', 'boss@example.com', '972501234567', 'sk-ant']) expect(json).not.toContain(secret);
    expect(snap.leadSettings.aiApiKey).toBe(REDACTED);
    expect(snap.leadSettings.webhookHeaderValue).toBe(REDACTED);
  });
});

describe('localizeLeadResult', () => {
  const he = (k) => t('he', k);
  const en = (k) => t('en', k);
  test('ok results pass through', () => {
    const r = { ok: true };
    expect(localizeLeadResult(r, he)).toBe(r);
  });
  test('error keys are translated per language, with the status code', () => {
    const r = { ok: false, status: 404, errorKey: 'lead.error.http' };
    expect(localizeLeadResult(r, en).error).toBe('The server rejected the request (404)');
    expect(localizeLeadResult(r, he).error).toBe('השרת סירב לבקשה (404)');
    expect(localizeLeadResult({ ok: false, error: 'timeout', errorKey: 'lead.error.timeout' }, he).error).toBe(he('lead.error.timeout'));
  });
  test('a raw network message is kept after the translated prefix', () => {
    expect(localizeLeadResult({ ok: false, error: 'ECONNREFUSED' }, en).error).toBe('Connection error: ECONNREFUSED');
  });
  test('delivery code returns no user-facing Hebrew in error fields', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/lib/lead-delivery.js'), 'utf8');
    const errorLines = src.split('\n').filter((l) => /error:/.test(l) && /[\u0590-\u05ff]/.test(l));
    expect(errorLines).toEqual([]);
  });
  test('every lead.error and clip.import key exists in both languages without long dashes', () => {
    const keys = Object.keys(STRINGS.he).filter((k) => k.startsWith('lead.error.') || k.startsWith('clip.import.'));
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const k of keys) {
      expect(STRINGS.en[k]).toBeTruthy();
      expect(STRINGS.he[k]).not.toMatch(/[—–]/);
    }
  });
});

describe('buildImportMessage', () => {
  const lim = { maxItems: 5000, maxText: 20000 };
  const base = { canceled: false, imported: 0, total: 0, duplicates: 0, invalid: 0, droppedByCap: 0, linksRemoved: 0, textTrimmed: 0, unreadable: false, limits: lim };
  const en2 = (k) => t('en', k);
  const he2 = (k) => t('he', k);
  test('cancelled dialog shows nothing', () => {
    expect(buildImportMessage({ canceled: true }, en2)).toBeNull();
  });
  test('imported N items', () => {
    expect(buildImportMessage({ ...base, imported: 7, total: 7 }, en2)).toEqual({ kind: 'ok', text: 'Imported 7 items' });
    expect(buildImportMessage({ ...base, imported: 1 }, en2).text).toBe('Imported 1 item');
    expect(buildImportMessage({ ...base, imported: 3 }, he2).text).toBe('יובאו 3 פריטים');
  });
  test('nothing imported, and the duplicate case is explained', () => {
    expect(buildImportMessage({ ...base, total: 0 }, en2)).toEqual({ kind: 'none', text: 'Nothing imported' });
    expect(buildImportMessage({ ...base, total: 4, duplicates: 4 }, en2).text).toBe('Nothing imported - all items are already in your history');
  });
  test('unreadable file', () => {
    expect(buildImportMessage({ canceled: false, imported: 0, unreadable: true, error: 'x' }, en2)).toEqual({ kind: 'error', text: 'Could not read this file' });
    expect(buildImportMessage({ canceled: false, imported: 0, error: 'Unexpected token' }, he2).text).toBe('לא ניתן לקרוא את הקובץ הזה');
  });
  test('reports unsafe links, size cap, trimmed text and invalid items', () => {
    const msg = buildImportMessage({ ...base, imported: 5000, linksRemoved: 3, droppedByCap: 120, textTrimmed: 2, invalid: 1 }, en2);
    expect(msg.kind).toBe('ok');
    expect(msg.text).toContain('Imported 5000 items');
    expect(msg.text).toContain('3 items lost unsafe links');
    expect(msg.text).toContain('120 items were left out because the file is too big (up to 5000 items)');
    expect(msg.text).toContain('2 items were shortened because the text is too long (up to 20000 characters)');
    expect(msg.text).toContain('1 invalid items were skipped');
  });
});

describe('store import statistics', () => {
  test('counts links removed, trimmed text, invalid, duplicates and the item cap', () => {
    jest.resetModules();
    const store = require('../src/lib/store');
    store.clearClipboardHistory();
    const items = [
      { id: 'a', text: 'one', actions: [{ label: 'x', url: 'https://ok.example' }, { label: 'y', url: 'file:///c:/x' }] },
      { id: 'b', text: 'z'.repeat(20001) },
      { id: 'a', text: 'dup' },
      { text: 'no id' },
      ...Array.from({ length: 5002 }, (_, i) => ({ id: 'n' + i, text: 't' + i }))
    ];
    const res = store.importClipboardHistoryData({ items });
    expect(res.total).toBe(items.length);
    expect(res.linksRemoved).toBe(1);
    expect(res.textTrimmed).toBe(1);
    expect(res.duplicates).toBe(1);
    expect(res.invalid).toBe(1);
    expect(res.droppedByCap).toBe(items.length - 5000);
    expect(res.unreadable).toBe(false);
  });
});

describe('packaging: the app runs as a normal user, the installer asks for admin', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  test('app manifest is asInvoker, install stays per-machine with elevation allowed', () => {
    expect(pkg.build.win.requestedExecutionLevel).toBe('asInvoker');
    expect(pkg.build.nsis.perMachine).toBe(true);
    expect(pkg.build.nsis.allowElevation).toBe(true);
  });
});
