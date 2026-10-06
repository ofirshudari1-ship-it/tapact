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
  return text.split('{שם}').join(trimmed || '').split('{name}').join(trimmed || '').replace(/\s{2,}/g, ' ').trim();
}

// --- Phone extraction & normalization (Israeli + international numbers) ---
// KEEP IN SYNC with desktop-agent/src/lib/phone.js (same functions, "pc" prefix). desktop-agent/tests/phone-corpus.test.js
// runs one corpus through both copies and fails if they disagree.

// Unicode clean-up applied before any matching: unusual dashes (hyphen, non-breaking
// hyphen, figure/en/em dash, minus sign) become '-', the many space variants become ' ',
// bidi / zero-width marks (LRM, RLM, embeddings, isolates, BOM) are dropped and Arabic-Indic /
// full-width digits become ASCII, so numbers copied from Word, web pages and RTL text parse.
function pcNormalizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[   -   　]/g, ' ')
    .replace(/[​-‏‪-‮⁠-⁩؜﻿]/g, '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
}

// Structured shipment numbers (Israel Post / UPU S10, UPS 1Z, DHL JD) contain digit runs that
// look like phones (RR523456789IL -> 523456789). They are removed before looking for a phone,
// whatever the tracking detector's on/off state - a postal code is never a phone number.
const PC_STRUCTURED_TRACKING_RE = /\b(?:[A-Za-z]{2}\d{9}[A-Za-z]{2}|1Z[0-9A-Za-z]{16}|JJ?D\d{16,18})\b/g;

function pcStripStructuredTracking(text) {
  return text.replace(PC_STRUCTURED_TRACKING_RE, ' ');
}

// Turns one "blob" of digits/separators into candidate numbers. A blob like
// "0501234567 0521234567" or "12 050-1234567" is several things glued together by
// whitespace; every contiguous run of whitespace-separated tokens is offered, earliest start
// first and longest first (so "050 123 4567" still comes out whole).
function pcSpansOfBlob(blob) {
  const tokens = blob.trim().split(/\s+/);
  if (tokens.length <= 1) return [blob.trim()];
  const capped = tokens.slice(0, 12);
  const out = [];
  for (let i = 0; i < capped.length; i++) {
    for (let j = capped.length; j > i; j--) out.push(capped.slice(i, j).join(' '));
  }
  return out;
}

function pcExtractCandidates(text) {
  if (typeof text !== 'string' || !text) return [];
  const clean = pcStripStructuredTracking(pcNormalizeText(text));
  const blobs = clean.match(/(\+?\d[\d\-.\s()]{6,}\d)/g) || [];
  const out = [];
  for (const blob of blobs) out.push(...pcSpansOfBlob(blob));
  return out;
}

// Returns E.164 digits without '+' (e.g. "972501234567" for mobile,
// "97231234567" for a landline), or null. Mobile: 05X-XXXXXXX (10 digits
// with the leading 0). Landline: 0X-XXXXXXX (9 digits with the leading 0).
// The national part (after 972) must look like a real Israeli number: mobile
// 5X (9 digits), landline 2/3/4/8/9 (8 digits), VoIP 72-79 (9 digits).
// Without this check any 9-digit run (ID number, order number, invoice)
// popped a WhatsApp popup the rep never wanted.
const PC_ISRAELI_NATIONAL = /^(?:5\d{8}|[23489]\d{7}|7[2-9]\d{7})$/;

// Israeli ID numbers (teudat zehut) are 9 digits, often start with 0, and so look
// like a 03-XXXXXXX landline. They carry a check digit (digits x 1,2,1,2..., sum
// the digits of each product, total divisible by 10), a random landline passes
// that only ~1 time in 10 - so a BARE 9-digit run starting with 0 that passes it
// is treated as an ID, not a phone. Formatted numbers (03-456-7891, +972...)
// are never affected.
function pcIsIsraeliId(nineDigits) {
  if (!/^\d{9}$/.test(nineDigits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(nineDigits[i]) * ((i % 2) + 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0;
}

// "+972 (0)50-123-4567": the "(0)" is the trunk zero people keep in brackets - drop it.
function pcDropBracketedTrunkZero(raw) {
  return raw.replace(/^(\s*\+?\s*(?:00)?\s*972[\s\-.]*)\(\s*0\s*\)/, '$1');
}

function pcNormalizeIsraeliPhone(raw) {
  if (typeof raw !== 'string') return null;
  raw = pcDropBracketedTrunkZero(pcNormalizeText(raw));
  if (/^\s*0\d{8}\s*$/.test(raw) && pcIsIsraeliId(raw.trim())) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00972')) digits = digits.slice(2);
  let national;
  if (digits.startsWith('972')) {
    national = digits.slice(3);
    if (national.startsWith('0')) national = national.slice(1); // "+972-050-..." keeps the trunk zero
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else if (digits.length === 9 && /^5[02-689]/.test(digits)) {
    // Bare mobile with the leading 0 dropped (e.g. by Excel). The second digit must be a real
    // mobile prefix (50,52-56,58,59): 51x are company/partnership numbers. Bare 8-digit
    // landlines are not guessed - too many ordinary numbers look like one.
    national = digits;
  } else {
    return null;
  }
  if (!PC_ISRAELI_NATIONAL.test(national)) return null;
  return '972' + national;
}

function pcFormatDisplay(normalized) {
  const local = '0' + normalized.slice(3);
  if (local.length === 10) return local.slice(0, 3) + '-' + local.slice(3);
  if (local.length === 9) return local.slice(0, 2) + '-' + local.slice(2);
  return local;
}

// International fallback (non-Israeli numbers) — only fires for an
// explicit "+countrycode..." copy. A bare local-looking number (no plus)
// is intentionally left alone here: without a country code there's no safe
// way to tell "052-1234567" (Israeli mobile, already handled above) apart
// from some other country's local format, so guessing would just produce
// false positives. Requiring the "+" keeps this additive and low-risk -
// it only ever matches text the Israeli-only detector already rejected.
function pcNormalizeInternationalPhone(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = pcNormalizeText(raw).trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    // explicit +countrycode
  } else if (/^00[1-9]/.test(trimmed) && !trimmed.startsWith('00972')) {
    digits = digits.slice(2); // 0044..., 00351...: the international call prefix
    if (digits.length < 9) return null;
  } else {
    return null;
  }
  if (digits.startsWith('972')) return null; // Israeli — pcNormalizeIsraeliPhone already owns this
  // E.164 allows up to 15 digits total; a real number needs at least a
  // couple digits of country code plus a subscriber number.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

// Best-effort grouping so the UI doesn't show one unbroken digit run -
// not authoritative per-country formatting (that needs a full numbering-
// plan database, out of scope for a lightweight local agent), just
// "country code, then groups of 3" which reads fine for the common cases
// a call center actually sees (UK/US/EU mobile numbers).
function pcFormatInternationalDisplay(normalized) {
  const ccLen = normalized.length > 10 ? 3 : normalized.length > 9 ? 2 : 1;
  const cc = normalized.slice(0, ccLen);
  const rest = normalized.slice(ccLen);
  const groups = rest.match(/.{1,3}/g) || [rest];
  return `+${cc} ${groups.join('-')}`;
}


// Scans free text for the first valid phone number (Israeli first, then international).
// Returns { raw, normalized, display, international? } or null.
function pcFindPhone(text) {
  const candidates = pcExtractCandidates(text);
  for (const c of candidates) {
    const normalized = pcNormalizeIsraeliPhone(c);
    if (normalized) return { raw: c.trim(), normalized, display: pcFormatDisplay(normalized) };
  }
  for (const c of candidates) {
    const normalized = pcNormalizeInternationalPhone(c);
    if (normalized) return { raw: c.trim(), normalized, display: pcFormatInternationalDisplay(normalized), international: true };
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
