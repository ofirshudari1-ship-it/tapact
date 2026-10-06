// User-defined custom action rules — "beyond the built-in phone/tracking/
// address/url/email detectors" (competitor research: ClipboardFusion's
// custom clipboard Macros, PhraseExpress's user-defined triggers). Each
// rule is { id, label, pattern, urlTemplate, enabled }: `pattern` is a
// regex tested against the copied text, `urlTemplate` is a URL containing
// the literal token "{value}" which is replaced by the match (capture
// group 1 if the pattern has one, otherwise the whole match).
//
// Security: only http(s) URL templates are honored — this runs whatever
// the user typed into Settings, so `javascript:`/`file:`/etc. templates
// are rejected rather than ever reaching shell.openExternal. Malformed
// regex (bad syntax, or one so pathological it could hang the clipboard-
// poll timer) is caught defensively; a broken rule is skipped, not thrown.
// Matching runs through lib/safe-regex.js: a hard time budget (vm timeout), a
// text-length cap, and patterns are validated when saved (validateRule below).

const { t } = require('../i18n-renderer');
const { safeMatch, validatePattern, MAX_PATTERN_LENGTH } = require('../safe-regex');

function isSafeUrlTemplate(urlTemplate) {
  return typeof urlTemplate === 'string' && /^https?:\/\//i.test(urlTemplate.trim());
}

function ruleIsUsable(rule) {
  if (!rule || rule.enabled === false) return false;
  if (typeof rule.pattern !== 'string' || !rule.pattern || rule.pattern.length > MAX_PATTERN_LENGTH) return false;
  return isSafeUrlTemplate(rule.urlTemplate);
}

// Used when saving from Settings: -> { ok: true } or { ok: false, code } with code
// 'empty' | 'too-long' | 'invalid' | 'nested' | 'slow' | 'bad-url'.
function validateRule(rule) {
  const p = validatePattern(rule && rule.pattern);
  if (!p.ok) return p;
  if (!isSafeUrlTemplate(rule.urlTemplate)) return { ok: false, code: 'bad-url' };
  return { ok: true };
}

function findCustomAction(text, rules, lang) {
  if (typeof text !== 'string' || !text || !Array.isArray(rules) || !rules.length) return null;

  for (const rule of rules) {
    if (!ruleIsUsable(rule)) continue;
    const match = safeMatch(rule.pattern, text);
    if (!match) continue;

    const value = match[1] !== undefined ? match[1] : match[0];
    const url = rule.urlTemplate.replace(/\{value\}/g, encodeURIComponent(value));
    // rule.label/rule.actionLabel are the user's own typed-in text (from
    // Settings ▸ Custom Rules) - not app copy, so they're used verbatim and
    // never routed through i18n. Only the *fallback* wording (when the user
    // left the rule unlabeled) and the surrounding "{label} detected"/
    // "Open ({label})" template are app copy and need translation.
    const label = rule.label || t(lang, 'detect.custom.defaultLabel');

    return {
      type: 'custom',
      subtype: rule.id,
      raw: match[0],
      display: value,
      title: t(lang, 'detect.custom.title').replace('{label}', label),
      actions: [{ id: 'custom', label: rule.actionLabel || t(lang, 'detect.custom.action.open').replace('{label}', label), url }]
    };
  }
  return null;
}

module.exports = { findCustomAction, isSafeUrlTemplate, validateRule };
