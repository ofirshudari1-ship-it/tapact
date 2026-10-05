// Loaded synchronously in every window's <head>, before the body is parsed.
// main.js puts the current language/theme in the URL (?lang=he&theme=dark,
// see bootQuery() there), so the first paint is already RTL/LTR and in the
// right theme instead of flashing the HTML defaults until the window's own
// IPC round-trip returns. The windows' CSP blocks inline scripts, which is
// why this is a file. Each window's own script still applies its settings
// afterwards as before - this only removes the wrong first frame.
(function () {
  let boot = { lang: 'en', theme: 'dark', manual: '', history: '', fromQuery: false };
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('lang')) {
      boot = {
        lang: q.get('lang') === 'he' ? 'he' : 'en',
        theme: q.get('theme') === 'light' ? 'light' : 'dark',
        manual: q.get('manual') || '',
        history: q.get('history') || '',
        fromQuery: true
      };
      const root = document.documentElement;
      root.lang = boot.lang;
      root.dir = boot.lang === 'he' ? 'rtl' : 'ltr';
      root.setAttribute('data-theme', boot.theme);
      document.addEventListener('DOMContentLoaded', () => {
        if (window.i18n) window.i18n.applyI18n(boot.lang);
      });
    }
  } catch (e) { /* keep defaults */ }
  window.__boot = boot;
})();
