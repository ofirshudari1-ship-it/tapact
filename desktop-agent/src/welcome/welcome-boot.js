// Loaded synchronously in <head>, before the body is parsed: applies the
// language direction and theme main.js passed in the query string
// (?lang=he&theme=dark&manual=...&history=...), so the first paint is
// already RTL/LTR and dark/light - no flash of the wrong layout.
(function () {
  try {
    const q = new URLSearchParams(window.location.search);
    const lang = q.get('lang') === 'he' ? 'he' : 'en';
    const theme = q.get('theme') === 'light' ? 'light' : 'dark';
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'he' ? 'rtl' : 'ltr';
    root.setAttribute('data-theme', theme);
    window.__welcomeBoot = { lang, theme, manual: q.get('manual') || '', history: q.get('history') || '' };
  } catch (e) {
    window.__welcomeBoot = { lang: 'en', theme: 'dark', manual: '', history: '' };
  }
})();
