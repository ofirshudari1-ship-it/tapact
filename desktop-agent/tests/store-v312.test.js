// v3.12 store changes: dedupe 60 is a one-time migration; imported history is sanitised.
beforeEach(() => { jest.resetModules(); });
const freshStore = () => require('../src/lib/store');

describe('dedupeSeconds 60 migration', () => {
  test('an old profile with 60 becomes 10 once, and a later deliberate 60 is kept', () => {
    const { migrateSettings } = freshStore();
    const first = migrateSettings({ dedupeSeconds: 60 });
    expect(first.settings.dedupeSeconds).toBe(10);
    expect(first.settings.migrationsApplied).toContain('dedupe10');
    const second = migrateSettings({ ...first.settings, dedupeSeconds: 60 });
    expect(second.settings.dedupeSeconds).toBe(60);
  });
  test('getSettings keeps a saved 60 after the migration marker exists', () => {
    const store = freshStore();
    store.getSettings(); // runs the migrations (marker set)
    store.saveSettings({ dedupeSeconds: 60 });
    expect(store.getSettings().dedupeSeconds).toBe(60);
    expect(store.getSettings().dedupeSeconds).toBe(60);
  });
});

describe('importClipboardHistoryData sanitising', () => {
  test('drops actions with file:/ms-msdt:/javascript: URLs and keeps allowed ones', () => {
    const store = freshStore();
    store.importClipboardHistoryData({
      items: [{
        id: 'evil', text: 'x', copiedAt: 1, category: 'url',
        actions: [
          { label: 'calc', url: 'file:///C:/Windows/System32/calc.exe' },
          { label: 'msdt', url: 'ms-msdt:/id PCWDiagnostic' },
          { label: 'js', url: 'javascript:alert(1)' },
          { label: 'fine', url: 'https://example.com/ok' }
        ]
      }]
    });
    const item = store.getClipboardHistory().find((h) => h.id === 'evil');
    expect(item.actions.map((a) => a.label)).toEqual(['fine']);
  });
  test('an item whose only actions are unsafe ends with no actions', () => {
    const store = freshStore();
    store.importClipboardHistoryData({ items: [{ id: 'e2', text: 'x', actions: [{ label: 'a', url: 'file:///x' }] }] });
    expect(store.getClipboardHistory().find((h) => h.id === 'e2').actions).toBeNull();
  });
  test('unknown categories, duplicate ids inside the file, huge text and junk ids are handled', () => {
    const store = freshStore();
    const res = store.importClipboardHistoryData({
      items: [
        { id: 'd1', text: 'a', category: '<script>' },
        { id: 'd1', text: 'again' },
        { id: { evil: 1 }, text: 'obj id' },
        { id: 'big', text: 'z'.repeat(50000) }
      ]
    });
    expect(res.imported).toBe(2);
    const list = store.getClipboardHistory();
    expect(list.find((h) => h.id === 'd1').category).toBe('text');
    expect(list.find((h) => h.id === 'big').text.length).toBe(20000);
  });
});
