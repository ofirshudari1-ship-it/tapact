// Summary of browser-<label>.json: real UI leaks (seeded user data excluded),
// axe by window/impact, console, lang/dir/theme mismatches, clipped fields.
// node summarize.cjs <before|after>
const path = require('path');
const LABEL = process.argv[2] || 'after';
const rows = require(path.resolve(__dirname, '..', `browser-${LABEL}.json`));
// Strings the harness seeded as USER content (templates are the app's
// Hebrew defaults, not UI chrome) - a leak check must not count them.
const USER = ['שלום John', 'מאמר', 'רחוב הרצל', 'פרויקט', 'John כהן', 'מספר הזמנה פנימי', 'Ticket (תמיכה)', 'פתח example.com',
  'ליד חדש', 'פולואפ', 'תזכורת (תור', 'לקוח קיים', 'כללי (ריק)', 'פתח הזמנה'];
const isUser = (t) => USER.some((u) => t.includes(u));
const out = { leaks: {}, axe: {}, console: [], mismatch: [], clippedShortcut: [] };
for (const r of rows) {
  if (!r.doc) continue;
  const w = r.window.replace(/__\d+x\d+/, '');
  for (const l of r.leaks || []) if (!isUser(l.t)) (out.leaks[`${r.lang}|${l.t}`] = out.leaks[`${r.lang}|${l.t}`] || new Set()).add(w);
  for (const v of r.axe || []) { const k = `${w} ${v.id} (${v.impact})`; out.axe[k] = (out.axe[k] || 0) + v.n; }
  for (const c of r.console || []) out.console.push(`${w} ${r.lang}/${r.theme}: ${c}`);
  if (r.doc.lang !== r.lang || r.doc.dir !== (r.lang === 'he' ? 'rtl' : 'ltr')) out.mismatch.push(`${w} ${r.lang}/${r.theme} lang=${r.doc.lang} dir=${r.doc.dir}`);
  if (r.doc.theme && r.doc.theme !== r.theme) out.mismatch.push(`${w} ${r.lang}/${r.theme} theme=${r.doc.theme}`);
  for (const f of r.fields || []) if (/shortcut/i.test(f.id) && f.dirAttr !== 'ltr') out.clippedShortcut.push(`${w} ${f.id} dir=${f.dirAttr}`);
}
console.log('UI leaks (user data excluded):'); for (const [k, v] of Object.entries(out.leaks)) console.log('  ', k, '<=', [...v].join(','));
console.log('axe (summed over configs):'); for (const [k, v] of Object.entries(out.axe)) console.log('  ', k, v);
console.log('console:', out.console.length ? out.console : 'none');
console.log('lang/dir/theme mismatches:', out.mismatch.length ? out.mismatch : 'none');
console.log('shortcut fields not dir=ltr:', out.clippedShortcut.length ? out.clippedShortcut : 'none');
const fr = rows.filter((r) => r.window === 'first-run-language');
console.log('first-run language:', fr.map((r) => `${r.lang}/${r.theme}: locale=${r.locale} stored=${r.storedLanguage}`).join(' | '));
