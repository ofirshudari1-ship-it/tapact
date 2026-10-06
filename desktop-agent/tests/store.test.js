// store.test.js — tests for src/lib/store.js using the in-memory Store mock.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Reset module registry between tests so each test gets a fresh store.
beforeEach(() => { jest.resetModules(); });

function freshStore() {
  return require('../src/lib/store');
}

// ─── getSettings / saveSettings ───────────────────────────────────────────────

describe('getSettings / saveSettings', () => {
  test('returns defaults on first call', () => {
    const store = freshStore();
    const s = store.getSettings();
    expect(s.enabled).toBe(true);
    expect(s.pollMs).toBe(250);
    expect(s.autoCloseSeconds).toBe(7);
    expect(s.detectors.phone).toBe(true);
    expect(s.detectors.tracking).toBe(true);
  });

  test('merges partial settings — does not wipe keys not in payload', () => {
    const store = freshStore();
    store.saveSettings({ pollMs: 1200 });
    const s = store.getSettings();
    expect(s.pollMs).toBe(1200);
    expect(s.enabled).toBe(true); // untouched
  });

  test('merges detectors deep — does not wipe other detector keys', () => {
    const store = freshStore();
    store.saveSettings({ detectors: { phone: false } });
    const s = store.getSettings();
    expect(s.detectors.phone).toBe(false);
    expect(s.detectors.tracking).toBe(true); // untouched
  });

  test('quietHours defaults to disabled with a sensible overnight window', () => {
    const store = freshStore();
    const s = store.getSettings();
    expect(s.quietHours.enabled).toBe(false);
    expect(s.quietHours.start).toBe('18:00');
    expect(s.quietHours.end).toBe('08:00');
  });

  test('merges quietHours deep — does not wipe other quietHours keys', () => {
    const store = freshStore();
    store.saveSettings({ quietHours: { enabled: true } });
    const s = store.getSettings();
    expect(s.quietHours.enabled).toBe(true);
    expect(s.quietHours.start).toBe('18:00'); // untouched
  });

  test('soundOnDetect defaults to false', () => {
    const store = freshStore();
    expect(store.getSettings().soundOnDetect).toBe(false);
  });

  test('closeToTray defaults to true (X hides to tray, not full quit)', () => {
    const store = freshStore();
    expect(store.getSettings().closeToTray).toBe(true);
  });

  test('trayClickAction defaults to history, trayHideHintSeen defaults to false, startPaused defaults to false', () => {
    const store = freshStore();
    const s = store.getSettings();
    expect(s.trayClickAction).toBe('history');
    expect(s.trayHideHintSeen).toBe(false);
    expect(s.startPaused).toBe(false);
  });

  test('saves and retrieves trayClickAction / startPaused without wiping other keys', () => {
    const store = freshStore();
    store.saveSettings({ trayClickAction: 'settings', startPaused: true });
    const s = store.getSettings();
    expect(s.trayClickAction).toBe('settings');
    expect(s.startPaused).toBe(true);
    expect(s.closeToTray).toBe(true); // untouched
  });

  test('autoInstallUpdates defaults to true (preserves pre-toggle hardcoded behavior)', () => {
    const store = freshStore();
    expect(store.getSettings().autoInstallUpdates).toBe(true);
  });

  test('autoInstallUpdates can be turned off and persists without wiping other keys', () => {
    const store = freshStore();
    store.saveSettings({ autoInstallUpdates: false });
    const s = store.getSettings();
    expect(s.autoInstallUpdates).toBe(false);
    expect(s.closeToTray).toBe(true); // untouched
  });

  test('trayHideHintSeen flips and stays true once saved', () => {
    const store = freshStore();
    store.saveSettings({ trayHideHintSeen: true });
    expect(store.getSettings().trayHideHintSeen).toBe(true);
  });

});

// ─── getLeadSettings / saveLeadSettings ───────────────────────────────────────

describe('getLeadSettings / saveLeadSettings', () => {
  test('returns defaults', () => {
    const store = freshStore();
    const ls = store.getLeadSettings();
    expect(ls.duplicateWindowHours).toBe(6);
    expect(ls.channelWhatsapp).toBe(true);
    expect(Array.isArray(ls.customSources)).toBe(true);
  });

  test('saves and retrieves partial updates', () => {
    const store = freshStore();
    store.saveLeadSettings({ webhookUrl: 'https://hook.example.com', channelWebhook: true });
    const ls = store.getLeadSettings();
    expect(ls.webhookUrl).toBe('https://hook.example.com');
    expect(ls.channelWebhook).toBe(true);
    expect(ls.channelWhatsapp).toBe(true); // untouched
  });
});

// ─── Lead history ─────────────────────────────────────────────────────────────

describe('lead history', () => {
  test('starts empty', () => {
    const store = freshStore();
    expect(store.getLeadHistory()).toEqual([]);
  });

  test('addLeadHistoryEntry prepends and returns all', () => {
    const store = freshStore();
    store.addLeadHistoryEntry({ name: 'אלי', phone: '0501111111' });
    store.addLeadHistoryEntry({ name: 'שרה', phone: '0502222222' });
    const history = store.getLeadHistory();
    expect(history[0].name).toBe('שרה'); // newest first
    expect(history[1].name).toBe('אלי');
  });

  test('clears lead history', () => {
    const store = freshStore();
    store.addLeadHistoryEntry({ name: 'רון', phone: '0503333333' });
    store.clearLeadHistory();
    expect(store.getLeadHistory()).toEqual([]);
  });

  test('respects LEAD_HISTORY_LIMIT (50)', () => {
    const store = freshStore();
    for (let i = 0; i < 60; i++) {
      store.addLeadHistoryEntry({ name: `Lead ${i}`, phone: `05000${String(i).padStart(5, '0')}` });
    }
    expect(store.getLeadHistory().length).toBe(50);
  });
});

// ─── findRecentLeadSend ───────────────────────────────────────────────────────

describe('findRecentLeadSend', () => {
  test('finds recent send by phone', () => {
    const store = freshStore();
    store.addLeadHistoryEntry({ name: 'דן', phone: '050-111-2222' });
    const found = store.findRecentLeadSend({ phone: '0501112222' }, 6);
    expect(found).not.toBeNull();
    expect(found.name).toBe('דן');
  });

  test('finds entry within window, misses entry outside window', () => {
    const store = freshStore();
    store.addLeadHistoryEntry({ name: 'חדש', phone: '050-888-8888' });
    // window=6h → just-added entry is within → found
    expect(store.findRecentLeadSend({ phone: '0508888888' }, 6)).not.toBeNull();
    // completely different phone → not found regardless of window
    expect(store.findRecentLeadSend({ phone: '0501111111' }, 6)).toBeNull();
  });

  test('returns null when phone not in history', () => {
    const store = freshStore();
    store.addLeadHistoryEntry({ name: 'מישהו', phone: '050-777-7777' });
    const notFound = store.findRecentLeadSend({ phone: '052-111-2222' }, 6);
    expect(notFound).toBeNull();
  });

  test('matches by name when no phone', () => {
    const store = freshStore();
    store.addLeadHistoryEntry({ name: 'מיכל כהן', phone: '' });
    const found = store.findRecentLeadSend({ name: 'מיכל כהן', phone: '' }, 6);
    expect(found).not.toBeNull();
  });
});

// ─── computeTags / saveTagRules ───────────────────────────────────────────────

describe('computeTags', () => {
  test('matches keywords case-insensitively', () => {
    const store = freshStore();
    store.saveTagRules([{ label: 'פרויקט X', keywords: ['פרויקט', 'project'] }]);
    expect(store.computeTags('נושא הפרויקט שלנו')).toEqual(['פרויקט X']);
    expect(store.computeTags('Our project update')).toEqual(['פרויקט X']);
  });

  test('returns empty array when no match', () => {
    const store = freshStore();
    store.saveTagRules([{ label: 'מכירות', keywords: ['sale', 'עסקה'] }]);
    expect(store.computeTags('שלום עולם')).toEqual([]);
  });

  test('matches multiple rules', () => {
    const store = freshStore();
    store.saveTagRules([
      { label: 'A', keywords: ['foo'] },
      { label: 'B', keywords: ['bar'] }
    ]);
    expect(store.computeTags('foo and bar')).toEqual(['A', 'B']);
  });

  test('returns empty for empty text', () => {
    const store = freshStore();
    store.saveTagRules([{ label: 'T', keywords: ['x'] }]);
    expect(store.computeTags('')).toEqual([]);
    expect(store.computeTags(null)).toEqual([]);
  });
});

// ─── templates ────────────────────────────────────────────────────────────────

describe('templates', () => {
  test('returns default templates', () => {
    const store = freshStore();
    const templates = store.getTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]).toHaveProperty('id');
    expect(templates[0]).toHaveProperty('label');
    expect(templates[0]).toHaveProperty('text');
  });

  test('saveTemplates and retrieve', () => {
    const store = freshStore();
    const custom = [{ id: 'c1', label: 'בדיקה', text: 'שלום {שם}' }];
    store.saveTemplates(custom, 'c1');
    expect(store.getTemplates()).toEqual(custom);
    expect(store.getDefaultTemplateId()).toBe('c1');
  });

  test('resetTemplates restores defaults', () => {
    const store = freshStore();
    store.saveTemplates([{ id: 'x', label: 'X', text: 'X' }], 'x');
    store.resetTemplates();
    expect(store.getTemplates().length).toBeGreaterThan(1);
  });
});

// ─── Clipboard history: pin, rotation cap, export/import ──────────────────────

describe('clipboard history pinning', () => {
  test('addClipboardHistoryItem defaults pinned to false', () => {
    const store = freshStore();
    const item = store.addClipboardHistoryItem({ text: 'hello' });
    expect(item.pinned).toBe(false);
  });

  test('togglePinClipboardHistoryItem flips pinned and persists', () => {
    const store = freshStore();
    const item = store.addClipboardHistoryItem({ text: 'hello' });
    store.togglePinClipboardHistoryItem(item.id);
    expect(store.getClipboardHistory()[0].pinned).toBe(true);
    store.togglePinClipboardHistoryItem(item.id);
    expect(store.getClipboardHistory()[0].pinned).toBe(false);
  });

  test('pinned items survive the historyStorageLimit rotation, unpinned ones age out', () => {
    const store = freshStore();
    store.saveSettings({ historyStorageLimit: 10 });
    const first = store.addClipboardHistoryItem({ text: 'keep me pinned' });
    store.togglePinClipboardHistoryItem(first.id);
    for (let i = 0; i < 15; i++) store.addClipboardHistoryItem({ text: `filler ${i}` });
    const history = store.getClipboardHistory();
    expect(history.length).toBeLessThanOrEqual(11); // 10 unpinned slots + 1 pinned
    expect(history.some((h) => h.id === first.id)).toBe(true);
  });
});

describe('clipboard history export / import', () => {
  test('exportClipboardHistoryData returns items with a version marker', () => {
    const store = freshStore();
    store.addClipboardHistoryItem({ text: 'a' });
    store.addClipboardHistoryItem({ text: 'b' });
    const data = store.exportClipboardHistoryData();
    expect(data.version).toBe(1);
    expect(data.items.length).toBe(2);
  });

  test('importClipboardHistoryData adds new items and skips already-present ids', () => {
    const store = freshStore();
    const existing = store.addClipboardHistoryItem({ text: 'already here' });
    const result = store.importClipboardHistoryData({
      version: 1,
      items: [
        { id: existing.id, text: 'already here', copiedAt: existing.copiedAt },
        { id: 'imported-1', text: 'from another pc', copiedAt: Date.now() }
      ]
    });
    expect(result.imported).toBe(1);
    expect(store.getClipboardHistory().some((h) => h.id === 'imported-1')).toBe(true);
    expect(store.getClipboardHistory().length).toBe(2); // no duplicate of the existing id
  });

  test('importClipboardHistoryData ignores malformed input', () => {
    const store = freshStore();
    expect(store.importClipboardHistoryData(null)).toEqual({ imported: 0 });
    expect(store.importClipboardHistoryData({})).toEqual({ imported: 0 });
    expect(store.importClipboardHistoryData({ items: [{ id: 'x' }] })).toEqual({ imported: 0 }); // no text
  });
});

// ─── First-run language marker (installer -> app handoff) ────────────────────

describe('first-run language marker', () => {
  test('consumes a "he" marker as the default language and deletes the file', () => {
    const electron = require('electron');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapact-lang-'));
    electron.app.getPath.mockReturnValue(tmpDir);
    const markerPath = path.join(tmpDir, 'first-run-language.txt');
    fs.writeFileSync(markerPath, 'he');

    const store = freshStore();
    expect(store.getSettings().language).toBe('he');
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  test('consumes an "en" marker as the default language and deletes the file', () => {
    const electron = require('electron');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapact-lang-'));
    electron.app.getPath.mockReturnValue(tmpDir);
    const markerPath = path.join(tmpDir, 'first-run-language.txt');
    fs.writeFileSync(markerPath, 'en');

    const store = freshStore();
    expect(store.getSettings().language).toBe('en');
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  test('falls back to app.getLocale() when no marker file exists', () => {
    const electron = require('electron');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapact-lang-'));
    electron.app.getPath.mockReturnValue(tmpDir);
    electron.app.getLocale.mockReturnValue('he-IL');

    const store = freshStore();
    expect(store.getSettings().language).toBe('he');
  });

  test('a saved settings.language always wins over the marker (never overrides an existing user preference)', () => {
    const electron = require('electron');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapact-lang-'));
    electron.app.getPath.mockReturnValue(tmpDir);

    const store = freshStore();
    store.saveSettings({ language: 'en' });

    // Simulate a marker somehow left behind after the user already has a
    // saved preference (should never happen from the installer itself,
    // since it only writes when tapact.json doesn't exist yet) - getSettings'
    // own merge (`{...DEFAULT_SETTINGS, ...saved}`) is the real safety net:
    // a saved language always overrides the default regardless of the
    // marker, since the default is only ever consulted once, at module load,
    // before any real preference exists.
    fs.writeFileSync(path.join(tmpDir, 'first-run-language.txt'), 'he');
    expect(store.getSettings().language).toBe('en');
  });
});

// ─── First-run language after app 'ready' (applyFirstRunLanguage) ────────────

describe('applyFirstRunLanguage', () => {
  function freshWithLocaleAtLoad(localeAtLoad, marker) {
    const electron = require('electron');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapact-frl-'));
    electron.app.getPath.mockReturnValue(tmpDir);
    electron.app.getLocale.mockReturnValue(localeAtLoad);
    if (marker) fs.writeFileSync(path.join(tmpDir, 'first-run-language.txt'), marker);
    return freshStore();
  }

  test('fresh install, no marker: follows the real OS locale (he)', () => {
    const store = freshWithLocaleAtLoad('', null); // pre-ready locale is not usable
    expect(store.getSettings().language).toBe('en');
    expect(store.applyFirstRunLanguage('he')).toBe('he');
    expect(store.getSettings().language).toBe('he');
    expect(store.getSettings().languageResolved).toBe(true);
  });

  test('fresh install, no marker: follows the real OS locale (en-US)', () => {
    const store = freshWithLocaleAtLoad('', null);
    expect(store.applyFirstRunLanguage('en-US')).toBe('en');
    expect(store.getSettings().language).toBe('en');
  });

  test('installer marker wins over the OS locale', () => {
    const store = freshWithLocaleAtLoad('', 'en');
    expect(store.applyFirstRunLanguage('he-IL')).toBe('en');
    expect(store.getSettings().language).toBe('en');
  });

  test('existing install (welcome already seen) is never changed', () => {
    const store = freshWithLocaleAtLoad('', null);
    store.saveSettings({ welcomeSeen: true, language: 'en' });
    expect(store.applyFirstRunLanguage('he-IL')).toBe('en');
    expect(store.getSettings().language).toBe('en');
    expect(store.getSettings().languageResolved).toBe(true);
  });

  test('runs once: a later call with another locale changes nothing', () => {
    const store = freshWithLocaleAtLoad('', null);
    store.applyFirstRunLanguage('he-IL');
    store.saveSettings({ language: 'en' }); // user switched in Settings
    expect(store.applyFirstRunLanguage('he-IL')).toBe('en');
    expect(store.getSettings().language).toBe('en');
  });
});

// ─── WhatsApp send history ────────────────────────────────────────────────────

describe('send history (WhatsApp)', () => {
  test('addHistoryEntry and getHistory', () => {
    const store = freshStore();
    store.addHistoryEntry({ normalized: '972501234567', display: '050-1234567', name: 'ג׳ון', templateLabel: 'ליד חדש' });
    const h = store.getHistory();
    expect(h.length).toBe(1);
    expect(h[0].name).toBe('ג׳ון');
  });

  test('findRecentSend finds entry within window', () => {
    const store = freshStore();
    store.addHistoryEntry({ normalized: '972501234567', display: '050-1234567', name: 'test', templateLabel: '' });
    const found = store.findRecentSend('972501234567', 30);
    expect(found).not.toBeNull();
  });

  test('findRecentSend misses different number', () => {
    const store = freshStore();
    store.addHistoryEntry({ normalized: '972501234567', display: '050-1234567', name: 'test', templateLabel: '' });
    expect(store.findRecentSend('972529999999', 30)).toBeNull();
  });

  test('clearHistory empties list', () => {
    const store = freshStore();
    store.addHistoryEntry({ normalized: '972501234567', display: '050-1234567', name: 'x', templateLabel: '' });
    store.clearHistory();
    expect(store.getHistory()).toEqual([]);
  });
});
