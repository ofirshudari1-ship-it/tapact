// One allowlist for every URL that reaches shell.openExternal from data the user
// (or a file they imported, or a custom rule) controls. Detectors only ever produce
// these schemes: https (maps, waze, 17track, calendar, WhatsApp Web, wa.me), http (a copied
// plain-http link or a custom rule), mailto (email), tel (call) and whatsapp (the desktop app).
// Everything else (file:, ms-msdt:, javascript:, search-ms:, ...) is refused.

const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:', 'whatsapp:'];

function isAllowedExternalUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 8000) return false;
  // Control characters / newlines inside a URL are never legitimate here.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  const m = /^([a-z][a-z0-9+.\-]*):/i.exec(trimmed);
  if (!m) return false;
  return ALLOWED_SCHEMES.includes(m[1].toLowerCase() + ':');
}

// Imported / stored history actions: keep only well-formed actions with an allowed URL
// (or a WhatsApp phone `wa`, which is rebuilt into a URL at click time). Returns null if none remain.
function sanitizeStoredActions(actions) {
  if (!Array.isArray(actions)) return null;
  const clean = [];
  for (const a of actions.slice(0, 8)) {
    if (!a || typeof a !== 'object') continue;
    const label = typeof a.label === 'string' ? a.label.slice(0, 200) : '';
    const wa = typeof a.wa === 'string' && /^\d{8,15}$/.test(a.wa) ? a.wa : null;
    const url = typeof a.url === 'string' && isAllowedExternalUrl(a.url) ? a.url.trim() : null;
    if (!wa && !url) continue;
    const out = { label };
    if (url) out.url = url;
    if (wa) out.wa = wa;
    if (typeof a.id === 'string') out.id = a.id.slice(0, 40);
    clean.push(out);
  }
  return clean.length ? clean : null;
}

module.exports = { ALLOWED_SCHEMES, isAllowedExternalUrl, sanitizeStoredActions };
