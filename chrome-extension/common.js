// Shared between popup.js and options.js. Loaded as a plain <script> (no modules),
// so it just defines globals on `window`.

const TAPACT_STORAGE_KEY = 'tapact_templates';
const TAPACT_DEFAULT_TEMPLATE_ID = 'tapact_default_template';

// Default lead-type templates for a sales call center. {שם} is replaced with
// whatever the rep typed in the name field; left as-is if the field is empty.
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

function pcFillTemplate(text, name) {
  const trimmed = (name || '').trim();
  return text.split('{שם}').join(trimmed || '').replace(/\s{2,}/g, ' ').trim();
}

// --- Phone extraction & normalization (Israeli numbers) ---

function pcExtractCandidates(text) {
  if (!text) return [];
  const matches = text.match(/(\+?\d[\d\-.\s()]{6,}\d)/g) || [];
  return matches;
}

// Returns E.164 digits without '+' (e.g. "972501234567" for mobile,
// "97231234567" for a landline), or null if it doesn't look like a valid
// Israeli number. Mobile numbers are 05X-XXXXXXX (10 digits with the leading
// 0); landlines are 0X-XXXXXXX (9 digits with the leading 0).
function pcNormalizeIsraeliPhone(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00972')) digits = digits.slice(2);
  if (digits.startsWith('972')) {
    // keep as-is
  } else if (digits.startsWith('0')) {
    digits = '972' + digits.slice(1);
  } else if (digits.length === 9 || digits.length === 8) {
    digits = '972' + digits; // leading 0 was stripped upstream (e.g. from a spreadsheet)
  } else {
    return null;
  }
  if (!digits.startsWith('972')) return null;
  if (digits.length !== 11 && digits.length !== 12) return null; // landline vs. mobile
  return digits;
}

function pcFormatDisplay(normalized) {
  const local = '0' + normalized.slice(3);
  if (local.length === 10) return local.slice(0, 3) + '-' + local.slice(3); // mobile: 0XX-XXXXXXX
  if (local.length === 9) return local.slice(0, 2) + '-' + local.slice(2); // landline: 0X-XXXXXXX
  return local;
}

// Scans free text for the first substring that normalizes to a valid Israeli
// phone number. Returns { raw, normalized, display } or null.
function pcFindPhone(text) {
  const candidates = pcExtractCandidates(text);
  for (const c of candidates) {
    const normalized = pcNormalizeIsraeliPhone(c);
    if (normalized) {
      return { raw: c.trim(), normalized, display: pcFormatDisplay(normalized) };
    }
  }
  return null;
}

function pcBuildWhatsAppUrl(normalizedPhone, message) {
  // WhatsApp Web directly (the team works in WhatsApp Web) - skips the wa.me interstitial page.
  const text = message ? '&text=' + encodeURIComponent(message) : '';
  return `https://web.whatsapp.com/send?phone=${normalizedPhone}${text}`;
}

// --- Storage ---

function pcLoadTemplates() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([TAPACT_STORAGE_KEY, TAPACT_DEFAULT_TEMPLATE_ID], (data) => {
      const templates = Array.isArray(data[TAPACT_STORAGE_KEY]) && data[TAPACT_STORAGE_KEY].length
        ? data[TAPACT_STORAGE_KEY]
        : DEFAULT_TEMPLATES;
      resolve({
        templates,
        defaultTemplateId: data[TAPACT_DEFAULT_TEMPLATE_ID] || templates[0].id
      });
    });
  });
}

function pcSaveTemplates(templates, defaultTemplateId) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({
      [TAPACT_STORAGE_KEY]: templates,
      [TAPACT_DEFAULT_TEMPLATE_ID]: defaultTemplateId
    }, resolve);
  });
}

// --- Settings (dedupe window) ---

const TAPACT_SETTINGS_KEY = 'tapact_settings';
const DEFAULT_SETTINGS = { dedupeMinutes: 30 };

function pcLoadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([TAPACT_SETTINGS_KEY], (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...(data[TAPACT_SETTINGS_KEY] || {}) });
    });
  });
}

function pcSaveSettings(settings) {
  return pcLoadSettings().then((current) => new Promise((resolve) => {
    chrome.storage.sync.set({ [TAPACT_SETTINGS_KEY]: { ...current, ...settings } }, resolve);
  }));
}

// --- Send history (last 25, local to this browser profile) ---

const TAPACT_HISTORY_KEY = 'tapact_history';
const TAPACT_HISTORY_LIMIT = 25;

function pcLoadHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TAPACT_HISTORY_KEY], (data) => {
      resolve(Array.isArray(data[TAPACT_HISTORY_KEY]) ? data[TAPACT_HISTORY_KEY] : []);
    });
  });
}

// entry: { normalized, display, name, templateLabel, sentAt }
function pcAddHistoryEntry(entry) {
  return pcLoadHistory().then((history) => new Promise((resolve) => {
    const next = [{ ...entry, sentAt: Date.now() }, ...history].slice(0, TAPACT_HISTORY_LIMIT);
    chrome.storage.local.set({ [TAPACT_HISTORY_KEY]: next }, () => resolve(next));
  }));
}

function pcClearHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TAPACT_HISTORY_KEY]: [] }, resolve);
  });
}

// Returns the most recent history entry for this number sent within the
// given window (minutes), or null. Used to warn "you already messaged this
// lead N minutes ago" before sending again.
function pcFindRecentSend(history, normalizedPhone, windowMinutes) {
  if (!windowMinutes) return null;
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  return history.find((h) => h.normalized === normalizedPhone && h.sentAt >= cutoff) || null;
}

function pcTimeAgoLabel(timestamp) {
  const diffMs = Date.now() - timestamp;
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `לפני ${mins} דק'`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `לפני ${hours} שע'`;
  const days = Math.round(hours / 24);
  return `לפני ${days} ימים`;
}
