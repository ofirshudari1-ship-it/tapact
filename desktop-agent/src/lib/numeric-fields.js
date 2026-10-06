// Numeric fields of Settings > General (and history limits): one place for their ranges and for the
// rule "an empty or invalid field keeps the previous value and says so; an out-of-range value is
// clamped and says so". Pure - works in the settings renderer (script tag) and in jest.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.tapactNumeric = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  // 0 is a valid value where the guide documents it: dedupe 0 = no wait, auto-close 0 = never.
  const RULES = {
    pollMs: { min: 200, max: 5000, step: 50, def: 250 },
    dedupeSeconds: { min: 0, max: 600, step: 5, def: 10 },
    autoCloseSeconds: { min: 0, max: 120, step: 1, def: 7 },
    sendDedupeMinutes: { min: 0, max: 1440, step: 5, def: 30 },
    autoRunDelaySeconds: { min: 1, max: 30, step: 1, def: 4 },
    historyStorageLimit: { min: 50, max: 5000, step: 50, def: 1000 },
    historyPreviewLimit: { min: 10, max: 200, step: 10, def: 50 }
  };

  // raw: the input's text. previous: the value currently saved (used when the field is empty/invalid).
  // -> { value, status: 'ok' | 'empty' | 'invalid' | 'clamped', min, max }
  function resolveField(key, raw, previous) {
    const rule = RULES[key];
    const fallback = Number.isFinite(Number(previous)) && previous !== null && previous !== '' ? Number(previous) : rule.def;
    const text = raw === undefined || raw === null ? '' : String(raw).trim();
    if (text === '') return { value: fallback, status: 'empty', min: rule.min, max: rule.max };
    const n = Number(text);
    if (!Number.isFinite(n)) return { value: fallback, status: 'invalid', min: rule.min, max: rule.max };
    const rounded = Math.round(n);
    const value = Math.min(rule.max, Math.max(rule.min, rounded));
    return { value, status: value !== rounded ? 'clamped' : 'ok', min: rule.min, max: rule.max };
  }

  // fields: { key: rawText }, previous: { key: savedValue } -> { values, notices: [{ key, status, value, min, max }] }
  function resolveFields(fields, previous) {
    const values = {};
    const notices = [];
    for (const key of Object.keys(fields)) {
      if (!RULES[key]) continue;
      const r = resolveField(key, fields[key], (previous || {})[key]);
      values[key] = r.value;
      if (r.status !== 'ok') notices.push({ key, status: r.status, value: r.value, min: r.min, max: r.max });
    }
    return { values, notices };
  }

  return { RULES, resolveField, resolveFields };
}));
