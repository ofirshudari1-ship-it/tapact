const { replaceNamePlaceholders, fillMessageTemplate } = require('../src/lib/template-fill');
const { fillTemplate } = require('../src/lib/phone');

describe('name placeholders', () => {
  test('both {שם} and {name} are filled', () => {
    expect(replaceNamePlaceholders('היי {שם}, מה שלומך', 'דני')).toBe('היי דני, מה שלומך');
    expect(replaceNamePlaceholders('Hi {name}, how are you', 'Dan')).toBe('Hi Dan, how are you');
    expect(replaceNamePlaceholders('{name} / {שם}', ' Dan ')).toBe('Dan / Dan');
  });
  test('empty name leaves a clean message (popup flavour)', () => {
    expect(fillMessageTemplate('Hi {name}, this is a test', '')).toBe('Hi, this is a test');
    expect(fillMessageTemplate('היי {שם}, הנה', '')).toBe('היי, הנה');
  });
  test('lib/phone fillTemplate accepts {name} too', () => {
    expect(fillTemplate('Hi {name}.', 'Ana')).toBe('Hi Ana.');
    expect(fillTemplate('היי {שם}.', 'ענת')).toBe('היי ענת.');
  });
  test('non-string input is safe', () => {
    expect(replaceNamePlaceholders(undefined, 'x')).toBe('');
  });
});

describe('settings migrations', () => {
  beforeEach(() => { jest.resetModules(); });
  const fresh = () => require('../src/lib/store');

  test('exact old default 10s auto-close becomes 7 once; a later user choice of 10 sticks', () => {
    const store = fresh();
    const r = store.migrateSettings({ autoCloseSeconds: 10, pollMs: 800 });
    expect(r.changed).toBe(true);
    expect(r.settings.autoCloseSeconds).toBe(7);
    expect(r.settings.pollMs).toBe(400);
    expect(r.settings.migrationsApplied).toEqual(expect.arrayContaining(['autoClose7', 'poll400']));
    const again = store.migrateSettings({ ...r.settings, autoCloseSeconds: 10, pollMs: 800 });
    expect(again.settings.autoCloseSeconds).toBe(10);
    expect(again.settings.pollMs).toBe(800);
    expect(again.changed).toBe(false);
  });
  test('custom values are untouched', () => {
    const r = fresh().migrateSettings({ autoCloseSeconds: 15, pollMs: 1000 });
    expect(r.settings.autoCloseSeconds).toBe(15);
    expect(r.settings.pollMs).toBe(1000);
  });
  test('removed settings are dropped; balloon-off marker carries over to the date-detector marker', () => {
    const r = fresh().migrateSettings({ showTrayNotification: true, startMinimized: true, trayBalloonOffApplied: true, migrationsApplied: ['autoClose7', 'poll400'] });
    expect(r.settings).not.toHaveProperty('showTrayNotification');
    expect(r.settings).not.toHaveProperty('startMinimized');
    expect(r.settings).not.toHaveProperty('trayBalloonOffApplied');
    expect(r.settings.dateDetectorOffApplied).toBe(true);
  });
  test('getSettings applies and persists the migration; snoozeUntil defaults to 0', () => {
    const store = fresh();
    store.saveSettings({ autoCloseSeconds: 10 });
    // saveSettings goes through getSettings (migration already marked), so 10 sticks after the first read.
    expect(store.getSettings().autoCloseSeconds).toBe(10);
    expect(store.getSettings().snoozeUntil).toBe(0);
    expect(store.getSettings()).not.toHaveProperty('showTrayNotification');
    expect(store.getSettings()).not.toHaveProperty('startMinimized');
  });
});

describe('default templates follow the language (never touching customized ones)', () => {
  beforeEach(() => { jest.resetModules(); });

  test('untouched Hebrew defaults become English defaults with {name}', () => {
    const store = require('../src/lib/store');
    const out = store.localizeDefaultTemplates(store.DEFAULT_TEMPLATES, 'en');
    expect(out).toHaveLength(store.DEFAULT_TEMPLATES.length);
    expect(out.map((t) => t.id)).toEqual(store.DEFAULT_TEMPLATES.map((t) => t.id));
    expect(out[0].text).toContain('{name}');
    expect(out[0].text).not.toMatch(/[֐-׿]/);
    expect(out[0].label).not.toMatch(/[֐-׿]/);
  });
  test('a template the user edited blocks the swap', () => {
    const store = require('../src/lib/store');
    const edited = store.DEFAULT_TEMPLATES.map((t, i) => (i === 2 ? { ...t, text: t.text + ' תוספת שלי' } : t));
    expect(store.localizeDefaultTemplates(edited, 'en')).toBeNull();
    const extra = [...store.DEFAULT_TEMPLATES, { id: 'mine', label: 'שלי', text: 'x' }];
    expect(store.localizeDefaultTemplates(extra, 'en')).toBeNull();
    const starred = store.DEFAULT_TEMPLATES.map((t, i) => (i === 0 ? { ...t, favorite: true } : t));
    expect(store.localizeDefaultTemplates(starred, 'en')).toBeNull();
  });
  test('Hebrew UI never changes Hebrew defaults; English defaults go back to Hebrew when untouched', () => {
    const store = require('../src/lib/store');
    expect(store.localizeDefaultTemplates(store.DEFAULT_TEMPLATES, 'he')).toBeNull();
    const back = store.localizeDefaultTemplates(store.DEFAULT_TEMPLATES_EN, 'he');
    expect(back[0].text).toBe(store.DEFAULT_TEMPLATES[0].text);
  });
  test('getTemplates switches stock templates for an English install and persists them', () => {
    const store = require('../src/lib/store');
    store.saveSettings({ language: 'en' });
    const t = store.getTemplates();
    expect(t[0].text).toContain('{name}');
    expect(store.getTemplates()[0].text).toContain('{name}');
  });
  test('getTemplates leaves customized templates alone on English installs', () => {
    const store = require('../src/lib/store');
    store.saveSettings({ language: 'en' });
    store.saveTemplates([{ id: 'x', label: 'Mine', text: 'היי {שם}' }], 'x');
    expect(store.getTemplates()[0].text).toBe('היי {שם}');
  });
  test('English default templates all use the {name} placeholder where they greet', () => {
    const store = require('../src/lib/store');
    for (const t of store.DEFAULT_TEMPLATES_EN) expect(t.text).toContain('{name}');
  });
});
