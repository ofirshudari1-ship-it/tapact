const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// The installer's language selector (package.json's
// `build.nsis.displayLanguageSelector`) writes the language the user picked
// into a small marker file, $APPDATA\TapAct\first-run-language.txt (see
// build-resources/installer.nsh's customInit) - only on a genuinely fresh
// install, never over an existing tapact.json. This consumes that marker
// once: reads it, deletes it (so it's never re-applied on a later run), and
// returns 'he'/'en', or null if it isn't there (every launch after the
// first, or an install that predates this mechanism). Wrapped in try/catch
// because `app` can be undefined very early in some test/CLI contexts, and
// the file may not exist or be readable.
function consumeFirstRunLanguageMarker() {
  try {
    if (!app || typeof app.getPath !== 'function') return null;
    const markerPath = path.join(app.getPath('userData'), 'first-run-language.txt');
    if (!fs.existsSync(markerPath)) return null;
    const raw = fs.readFileSync(markerPath, 'utf8').trim().toLowerCase();
    fs.unlinkSync(markerPath);
    return raw === 'he' ? 'he' : raw === 'en' ? 'en' : null;
  } catch (e) {
    return null;
  }
}

// Resolves the language TapAct starts with on a brand-new install, so the
// welcome wizard doesn't need to ask again. The installer's own explicit
// choice (via the marker above) takes priority; if it's missing (e.g. an
// install built before this existed, or the marker was somehow lost),
// Electron's `app.getLocale()` - the OS/Windows display language - is the
// last-resort fallback. Wrapped in try/catch because `app` can be undefined
// very early in some test/CLI contexts.
function resolveDefaultLanguage() {
  try {
    const fromInstaller = consumeFirstRunLanguageMarker();
    if (fromInstaller) return fromInstaller;
    const locale = (app && typeof app.getLocale === 'function' && app.getLocale()) || '';
    return locale.toLowerCase().startsWith('he') ? 'he' : 'en';
  } catch (e) {
    return 'en';
  }
}

const DEFAULT_TEMPLATES = [
  {
    id: 'new-lead',
    label: 'ליד חדש',
    text: 'היי {שם}, מדבר/ת ממוקד השירות 🙂\nראיתי שהשארת פרטים אצלנו ורציתי לחזור אליך לגבי הבקשה שלך.\nנוח לך שנדבר עכשיו בכמה מילים?'
  },
  {
    id: 'follow-up',
    label: 'פולואפ / מעקב',
    text: 'היי {שם}, זה שוב אני 🙂\nרציתי לבדוק מה קורה מהשיחה הקודמת שלנו ואם יש שאלות שיכולות לעזור לך להתקדם.'
  },
  {
    id: 'reminder',
    label: 'תזכורת (תור/מסמכים)',
    text: 'היי {שם}, תזכורת קטנה מהמוקד שלנו 🙂\nחסרים לנו כמה מסמכים/פרטים כדי להמשיך בטיפול בבקשה שלך - תוכל/י לשלוח כאן בהזדמנות?'
  },
  {
    id: 'existing-customer',
    label: 'לקוח קיים - עדכון סטטוס',
    text: 'היי {שם}, מעדכן/ת אותך לגבי הסטטוס של הבקשה שלך אצלנו. יש התקדמות ואשמח לספר לך בכמה מילים.'
  },
  {
    id: 'general',
    label: 'כללי (ריק)',
    text: 'היי {שם},'
  }
];

const DEFAULT_LEAD_SETTINGS = {
  webhookUrl: '',
  webhookHeaderName: '',
  webhookHeaderValue: '',
  channelWebhook: false,
  channelWhatsapp: true,
  whatsappNumber: '',
  channelEmail: false,
  emailAddress: '',
  channelSlack: false,
  slackWebhookUrl: '',
  channelCopy: false,
  messageTemplate: '',
  aiEnabled: false,
  aiApiKey: '',
  customSources: [],
  duplicateWindowHours: 6
};

const LEAD_HISTORY_LIMIT = 50;

const DEFAULT_SETTINGS = {
  enabled: true,
  pollMs: 800,
  dedupeSeconds: 60, // suppresses re-popping the SAME clipboard text too often
  autoCloseSeconds: 10,
  sendDedupeMinutes: 30, // "you already messaged this lead" warning window
  autoLaunch: false,
  // Which clipboard detectors are active. Phone is handled separately (it
  // opens the richer WhatsApp-composer popup); the rest share the generic
  // one-click action popup. All on by default - each is free to disable.
  detectors: {
    phone: true,
    tracking: true,
    address: true,
    datetime: true,
    url: true,
    email: true
  },
  // Clipboard-history panel (Win+V-style "everything you copied, not just
  // what matched a detector"). Independent of the `detectors` flags above -
  // those gate the instant action popup, this gates whether copies get
  // logged at all. On by default to match what the user asked for and what
  // Windows' own Win+V does, but a one-click pause + full clear are exposed
  // in Settings since this is a meaningfully bigger privacy surface than
  // the rest of the app (everything copied, not just what triggered a
  // popup, persisted to disk until cleared or rotated out).
  historyEnabled: true,
  // Two different numbers on purpose: `historyStorageLimit` is how much
  // actually lives on disk (a high but still bounded cap - "unlimited" for
  // a JSON-file-backed store that's fully re-read/re-written on every
  // change isn't safe long-term: a few thousand entries stays fast, an
  // ever-growing file eventually doesn't), `historyPreviewLimit` is how
  // many of those the history panel renders per page, so opening it stays
  // instant even once storage has hundreds of entries - "טען עוד" pages
  // through the rest.
  historyStorageLimit: 1000,
  historyPreviewLimit: 50,
  // Keyboard shortcuts - merged over DEFAULT_SHORTCUTS in main.js, so this
  // only needs to hold what the user actually changed from default.
  shortcuts: {},
  // First-run onboarding (see welcome-window). False until the user
  // finishes or skips it once.
  welcomeSeen: false,
  // Plays a short system beep (Electron's built-in shell.beep(), no asset
  // file needed) whenever a popup opens from an automatic clipboard
  // detection - off by default since a silent popup is the existing/
  // expected behavior and some users run this on a shared/quiet machine.
  soundOnDetect: false,
  // Do-not-disturb window: suppresses the *automatic* clipboard-triggered
  // popup (phone/tracking/address/etc.) during a daily time range, e.g. for
  // meetings or off-hours - the clipboard is still watched and still logged
  // to history, only the interrupting popup is skipped. `start`/`end` are
  // "HH:MM" 24h local time; `end` < `start` means it wraps past midnight
  // (e.g. 18:00 -> 08:00). Manual triggers (shortcut/tray click) always
  // still open the popup regardless of this window - it only guards the
  // unattended/background path.
  quietHours: {
    enabled: false,
    start: '18:00',
    end: '08:00'
  },
  // Which action is "primary" (the big button, and what auto-run below
  // fires) for detectors that offer more than one - e.g. address offers
  // both Maps and Waze. Keyed by detector type -> action id (see the `id`
  // field on each detector's actions[]). Empty/unset = keep the detector's
  // own default order.
  actionPreferences: {},
  // Optional: instead of waiting for a click, run the primary action by
  // itself after this many seconds (still shows the popup first, so the
  // user can see what's about to happen and cancel by closing it). Off by
  // default - clicking is still the norm, this is for anyone who wants
  // TapAct to just go ahead once something matches.
  autoRunAction: false,
  autoRunDelaySeconds: 4,
  // Appearance & language. Defaults to the OS display language on a fresh
  // install (see resolveDefaultLanguage above) - once anything is saved to
  // disk this default is never consulted again, so it can't override a
  // language the user picked afterward in Settings.
  language: resolveDefaultLanguage(),       // 'he' | 'en'
  theme: 'dark',        // 'dark' | 'light'
  // Startup & window behavior
  startMinimized: false,  // launch straight to tray, skip popup window
  closeToTray: true,      // X button hides instead of quitting
  showTrayNotification: true,  // balloon notification on phone detection
  // Shown once, the first time a window is ever hidden (not closed) to the
  // tray — a short balloon explaining that TapAct is still running and
  // how to actually quit it. Flips true after it's shown once; never shown
  // again after that regardless of how many more times a window is hidden.
  trayHideHintSeen: false,
  // What a single left-click on the tray icon does. Right-click always opens
  // the full context menu (with the separate, unambiguous "יציאה"/Exit item)
  // regardless of this setting. 'history' | 'settings' | 'none'.
  trayClickAction: 'history',
  // Shared/work-PC option: every launch starts with monitoring paused,
  // regardless of whatever `enabled` was left at when the app last closed -
  // useful on a machine other people also use, so TapAct doesn't start
  // silently watching the clipboard by default. Toggling "ניטור לוח פעיל"
  // back on from the tray/Settings after launch works as normal; this only
  // affects the state at startup.
  startPaused: false,
  // Whether a downloaded update installs itself automatically the next time
  // TapAct quits (drives autoUpdater.autoInstallOnAppQuit in main.js - see
  // initAutoUpdater). Defaults to true: before this setting existed the app
  // already did this unconditionally and hardcoded, so ON preserves exactly
  // what every existing install already experiences today - flipping the
  // default to off here would silently change already-shipped behavior for
  // current users the first time they update into the build that adds this
  // toggle. Anyone who'd rather install manually can turn it off in Settings
  // ▸ About ▸ Updates; "Check for Updates Now" and downloading always still
  // work regardless of this flag.
  autoInstallUpdates: true
};

const store = new Store({
  name: 'tapact',
  defaults: {
    templates: DEFAULT_TEMPLATES,
    defaultTemplateId: DEFAULT_TEMPLATES[0].id,
    settings: DEFAULT_SETTINGS,
    leadSettings: DEFAULT_LEAD_SETTINGS,
    history: [],
    clipboardHistory: [],
    leadHistory: [],
    tagRules: [],
    customActionRules: []
  }
});

const HISTORY_LIMIT = 25;

function getTemplates() {
  return store.get('templates', DEFAULT_TEMPLATES);
}

function getDefaultTemplateId() {
  return store.get('defaultTemplateId', DEFAULT_TEMPLATES[0].id);
}

function saveTemplates(templates, defaultTemplateId) {
  store.set('templates', templates);
  store.set('defaultTemplateId', defaultTemplateId);
}

function resetTemplates() {
  store.set('templates', DEFAULT_TEMPLATES);
  store.set('defaultTemplateId', DEFAULT_TEMPLATES[0].id);
}

function getSettings() {
  const saved = store.get('settings', DEFAULT_SETTINGS);
  const merged = {
    ...DEFAULT_SETTINGS,
    ...saved,
    detectors: { ...DEFAULT_SETTINGS.detectors, ...(saved.detectors || {}) },
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(saved.shortcuts || {}) },
    actionPreferences: { ...DEFAULT_SETTINGS.actionPreferences, ...(saved.actionPreferences || {}) },
    quietHours: { ...DEFAULT_SETTINGS.quietHours, ...(saved.quietHours || {}) }
  };
  // Migrate: earlier defaults were 20s, then 5s; clamp down to the current
  // 4s default for anyone who still has either old value saved.
  if (merged.autoCloseSeconds === 20 || merged.autoCloseSeconds === 5 || merged.autoCloseSeconds === 4) merged.autoCloseSeconds = 10;
  return merged;
}

function saveSettings(settings) {
  const current = getSettings();
  store.set('settings', {
    ...current,
    ...settings,
    detectors: { ...current.detectors, ...(settings.detectors || {}) },
    shortcuts: { ...current.shortcuts, ...(settings.shortcuts || {}) },
    actionPreferences: { ...current.actionPreferences, ...(settings.actionPreferences || {}) },
    quietHours: { ...current.quietHours, ...(settings.quietHours || {}) }
  });
}

function getHistory() {
  return store.get('history', []);
}

function addHistoryEntry(entry) {
  const next = [{ ...entry, sentAt: Date.now() }, ...getHistory()].slice(0, HISTORY_LIMIT);
  store.set('history', next);
  return next;
}

function clearHistory() {
  store.set('history', []);
}

// Most recent history entry for this number sent within `windowMinutes`, or
// null. Used to warn "you already messaged this lead N minutes ago".
function findRecentSend(normalizedPhone, windowMinutes) {
  if (!windowMinutes) return null;
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  return getHistory().find((h) => h.normalized === normalizedPhone && h.sentAt >= cutoff) || null;
}

// --- Clipboard history (every copy, Win+V-style - distinct from the
// WhatsApp send history above) ---

function getClipboardHistory() {
  return store.get('clipboardHistory', []);
}

// Paginated read for the history panel: `offset`/`limit` slice into the
// full (already newest-first) stored list, so opening the panel only
// touches `limit` items rather than the whole backing store. `total` lets
// the renderer show "מציג 50 מתוך 340" and know whether "טען עוד" has
// anything left to fetch.
function getClipboardHistoryPage({ offset = 0, limit = 50 } = {}) {
  const all = getClipboardHistory();
  return { items: all.slice(offset, offset + limit), total: all.length };
}

function addClipboardHistoryItem(entry) {
  const limit = getSettings().historyStorageLimit || 1000;
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: entry.text,
    category: entry.category || 'text',
    actions: entry.actions || null,
    tags: entry.tags || [],
    pinned: false,
    copiedAt: Date.now()
  };
  const next = trimToLimit([item, ...getClipboardHistory()], limit);
  store.set('clipboardHistory', next);
  return item;
}

// Enforces historyStorageLimit without ever dropping a pinned item (Ditto/
// ClipboardFusion-style "sticky" items - a rep pins a template/reply once and
// it survives the rotation cap forever, unlike everything else that ages
// out). Pinned items don't count against the cap; the newest unpinned
// items fill whatever room is left. Order (newest-first overall) is
// preserved exactly as the caller passed it in - this only decides what to
// drop, never reorders.
function trimToLimit(list, limit) {
  const pinnedCount = list.filter((i) => i.pinned).length;
  const room = Math.max(0, limit - pinnedCount);
  let unpinnedKept = 0;
  return list.filter((item) => {
    if (item.pinned) return true;
    if (unpinnedKept < room) { unpinnedKept += 1; return true; }
    return false;
  });
}

// Pin/unpin (ClipboardFusion's "Pinned Items", Ditto's "sticky" entries) -
// exempts the item from the historyStorageLimit rotation above, so a rep can
// keep a frequently-reused snippet (a standard reply, an account number)
// around indefinitely instead of it aging out with everything else.
function togglePinClipboardHistoryItem(id) {
  const next = getClipboardHistory().map((item) =>
    item.id === id ? { ...item, pinned: !item.pinned } : item
  );
  store.set('clipboardHistory', next);
  return next;
}

function deleteClipboardHistoryItem(id) {
  const next = getClipboardHistory().filter((item) => item.id !== id);
  store.set('clipboardHistory', next);
  return next;
}

function clearClipboardHistory() {
  store.set('clipboardHistory', []);
}

// --- Export / import clipboard history (local-only JSON backup, and a
// genuinely-usable stand-in for cross-device sync without a backend: export
// on one PC, import on another - see CHANGELOG for why real sync wasn't
// feasible here) ---

function exportClipboardHistoryData() {
  return { version: 1, exportedAt: Date.now(), items: getClipboardHistory() };
}

// Merges an exported file's items into the current history: skips anything
// already present (by id, so re-importing the same file twice is a no-op),
// then re-applies the same pinned-aware rotation cap as a normal new copy so
// importing a huge history from another machine can't blow past
// historyStorageLimit. Returns how many items were actually added.
function importClipboardHistoryData(data) {
  if (!data || !Array.isArray(data.items)) return { imported: 0 };
  const existingIds = new Set(getClipboardHistory().map((i) => i.id));
  const incoming = data.items.filter((i) => i && typeof i.text === 'string' && i.id && !existingIds.has(i.id));
  if (!incoming.length) return { imported: 0 };

  const sanitized = incoming.map((i) => ({
    id: i.id,
    text: i.text,
    category: i.category || 'text',
    actions: i.actions || null,
    tags: Array.isArray(i.tags) ? i.tags : [],
    pinned: i.pinned === true,
    copiedAt: typeof i.copiedAt === 'number' ? i.copiedAt : Date.now()
  }));

  const merged = [...sanitized, ...getClipboardHistory()].sort((a, b) => b.copiedAt - a.copiedAt);
  const limit = getSettings().historyStorageLimit || 1000;
  store.set('clipboardHistory', trimToLimit(merged, limit));
  return { imported: sanitized.length };
}

// --- Auto-tag rules (keyword -> tag label, for finding copies by context
// later - e.g. "פרויקט X" tags anything containing that phrase) ---

function getTagRules() {
  return store.get('tagRules', []);
}

function saveTagRules(rules) {
  const cleaned = (rules || [])
    .map((r) => ({
      id: r.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: (r.label || '').trim(),
      keywords: (r.keywords || []).map((k) => k.trim()).filter(Boolean)
    }))
    .filter((r) => r.label && r.keywords.length);
  store.set('tagRules', cleaned);
  return cleaned;
}

// Returns the labels of every rule whose keyword appears in `text`
// (case-insensitive substring match - simple on purpose, this runs on
// every clipboard poll tick).
function computeTags(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return getTagRules()
    .filter((rule) => rule.keywords.some((k) => lower.includes(k.toLowerCase())))
    .map((rule) => rule.label);
}

// --- Custom action rules (user-defined "copy X -> open URL" rules,
// beyond the built-in phone/tracking/address/url/email detectors) ---

const MAX_CUSTOM_RULES = 30; // generous for a call-center's own shortcuts, bounded so the poll loop never has to test an unbounded list

function getCustomActionRules() {
  return store.get('customActionRules', []);
}

function saveCustomActionRules(rules) {
  const cleaned = (rules || [])
    .slice(0, MAX_CUSTOM_RULES)
    .map((r) => ({
      id: r.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: (r.label || '').trim(),
      pattern: (r.pattern || '').trim(),
      urlTemplate: (r.urlTemplate || '').trim(),
      actionLabel: (r.actionLabel || '').trim(),
      enabled: r.enabled !== false
    }))
    .filter((r) => r.label && r.pattern && r.urlTemplate);
  store.set('customActionRules', cleaned);
  return cleaned;
}

// Most recent clipboard-history items that had a detected action — feeds
// the tray's "Recent actions" quick-repeat submenu (Raycast/ClipboardFusion-
// style one-click re-fire without reopening the full history panel).
function getRecentActionableHistory(limit = 5) {
  return getClipboardHistory()
    .filter((item) => item.actions && item.actions.length)
    .slice(0, limit);
}

function isWelcomeSeen() {
  return getSettings().welcomeSeen === true;
}

function markWelcomeSeen() {
  saveSettings({ welcomeSeen: true });
}

// Update-check status shown in Settings - written only from main.js's own
// autoUpdater event handlers (never from a renderer-originated patch, so
// this bypasses settings-guard's allowlist on purpose, same as
// markWelcomeSeen above).
function getUpdateCheckStatus() {
  return store.get('updateCheckStatus', { state: 'idle', version: null, lastCheckedAt: null, error: null });
}

function setUpdateCheckStatus(status) {
  store.set('updateCheckStatus', { ...getUpdateCheckStatus(), ...status });
}

// --- Lead capture settings & history ---

function getLeadSettings() {
  const saved = store.get('leadSettings', DEFAULT_LEAD_SETTINGS);
  return { ...DEFAULT_LEAD_SETTINGS, ...saved };
}

function saveLeadSettings(settings) {
  const current = getLeadSettings();
  store.set('leadSettings', { ...current, ...settings });
}

function getLeadHistory() {
  return store.get('leadHistory', []);
}

function addLeadHistoryEntry(entry) {
  const next = [{ ...entry, sentAt: Date.now() }, ...getLeadHistory()].slice(0, LEAD_HISTORY_LIMIT);
  store.set('leadHistory', next);
  return next;
}

function clearLeadHistory() {
  store.set('leadHistory', []);
}

// Checks if the same phone (or name if no phone) was sent recently within
// duplicateWindowHours. Returns the matching entry or null.
function findRecentLeadSend(lead, windowHours) {
  const hours = windowHours || 6;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const history = getLeadHistory();
  const phone = (lead.phone || '').replace(/[^\d]/g, '');
  const name = (lead.name || '').trim().toLowerCase();
  return history.find((item) => {
    if (!(item.sentAt >= cutoff)) return false;
    const itemPhone = (item.phone || '').replace(/[^\d]/g, '');
    if (phone && itemPhone) return phone === itemPhone;
    if (!phone && !itemPhone) return name && (item.name || '').trim().toLowerCase() === name;
    return false;
  }) || null;
}

module.exports = {
  DEFAULT_TEMPLATES,
  DEFAULT_SETTINGS,
  getTemplates,
  getDefaultTemplateId,
  saveTemplates,
  resetTemplates,
  getSettings,
  saveSettings,
  getHistory,
  addHistoryEntry,
  clearHistory,
  findRecentSend,
  getClipboardHistory,
  getClipboardHistoryPage,
  addClipboardHistoryItem,
  togglePinClipboardHistoryItem,
  deleteClipboardHistoryItem,
  clearClipboardHistory,
  exportClipboardHistoryData,
  importClipboardHistoryData,
  getTagRules,
  saveTagRules,
  computeTags,
  getCustomActionRules,
  saveCustomActionRules,
  getRecentActionableHistory,
  isWelcomeSeen,
  markWelcomeSeen,
  getLeadSettings,
  saveLeadSettings,
  getLeadHistory,
  addLeadHistoryEntry,
  clearLeadHistory,
  findRecentLeadSend,
  DEFAULT_LEAD_SETTINGS,
  getUpdateCheckStatus,
  setUpdateCheckStatus
};
