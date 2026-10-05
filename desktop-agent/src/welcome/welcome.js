// First-run guide. Language/theme come from welcome-boot.js (query string set
// by main.js) so everything below runs before the first paint - this script
// sits at the end of <body>, and it applies the texts synchronously instead
// of waiting for an IPC round-trip. The page's CSP blocks inline scripts, so
// all logic lives here.
(function () {
  const boot = window.__welcomeBoot || { lang: 'en', theme: 'dark', manual: '', history: '' };
  const fmt = (acc) => (window.formatAccelerator ? window.formatAccelerator(acc) : acc);
  const shortcuts = {
    manual: fmt(boot.manual) || 'Ctrl+Alt+P',
    history: fmt(boot.history) || 'Ctrl+Alt+V'
  };
  let lang = boot.lang;
  const t = (key) => (window.i18n ? window.i18n.t(lang, key) : key);

  const steps = Array.from(document.querySelectorAll('.step'));
  const dotsEl = document.getElementById('dots');
  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const skipBtn = document.getElementById('skipBtn');
  const progressFill = document.getElementById('progressFill');
  const langBtn = document.getElementById('langToggleBtn');
  const themeBtn = document.getElementById('themeToggleBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  let current = 0;

  // "Open it with {shortcut} ..." - the shortcut is a separate LTR-isolated
  // <kbd>, so "Ctrl+Alt+V" never gets reordered inside a Hebrew sentence.
  function renderShortcutLines() {
    document.querySelectorAll('[data-i18n-shortcut]').forEach((el) => {
      const text = t(el.getAttribute('data-i18n-shortcut'));
      const parts = text.split('{shortcut}');
      el.textContent = '';
      parts.forEach((part, i) => {
        if (part) el.appendChild(document.createTextNode(part));
        if (i < parts.length - 1) {
          const kbd = document.createElement('kbd');
          kbd.dir = 'ltr';
          kbd.textContent = shortcuts[el.getAttribute('data-shortcut')] || '';
          el.appendChild(kbd);
        }
      });
    });
  }

  function applyLanguage(next) {
    lang = next === 'he' ? 'he' : 'en';
    if (window.i18n) window.i18n.applyI18n(lang);
    document.title = t('welcome.doc.title');
    renderShortcutLines();
    // Shows the language you would switch TO, in that language.
    langBtn.textContent = lang === 'he' ? '🌐 English' : '🌐 עברית';
    langBtn.lang = lang === 'he' ? 'en' : 'he';
    dots.forEach((d, i) => d.setAttribute('aria-label', t('welcome.step.label').replace('{n}', i + 1).replace('{total}', steps.length)));
    updateNav();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  const dots = steps.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot';
    dot.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(dot);
    return dot;
  });

  function updateNav() {
    const isLast = current === steps.length - 1;
    backBtn.disabled = current === 0;
    nextBtn.textContent = isLast ? t('welcome.btn.done') : t('welcome.btn.next');
    nextBtn.classList.toggle('next', !isLast);
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === current);
      if (i === current) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    if (progressFill) progressFill.style.width = ((current + 1) / steps.length * 100) + '%';
  }

  function goTo(idx) {
    const target = Math.max(0, Math.min(steps.length - 1, idx));
    if (target === current) return;
    const forward = target > current;
    steps[current].classList.remove('active', 'anim-forward', 'anim-back');
    current = target;
    const step = steps[current];
    void step.offsetWidth; // restart the animation
    step.classList.add('active', forward ? 'anim-forward' : 'anim-back');
    updateNav();
  }

  backBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => {
    if (current < steps.length - 1) goTo(current + 1);
    else if (window.tapactWelcome) window.tapactWelcome.finish();
  });
  skipBtn.addEventListener('click', () => { if (window.tapactWelcome) window.tapactWelcome.skip(); });
  if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => { if (window.tapactWelcome && window.tapactWelcome.openSettings) window.tapactWelcome.openSettings(); });

  langBtn.addEventListener('click', () => {
    const next = lang === 'he' ? 'en' : 'he';
    applyLanguage(next);
    if (window.tapactWelcome) window.tapactWelcome.saveSetting('language', next);
  });
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (window.tapactWelcome) window.tapactWelcome.saveSetting('theme', next);
  });

  // Arrow keys follow the reading direction: in Hebrew, Left = next.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (window.tapactWelcome) window.tapactWelcome.skip(); return; }
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowLeft') goTo(current + (rtl ? 1 : -1));
    if (e.key === 'ArrowRight') goTo(current + (rtl ? -1 : 1));
  });

  // The "want Win+V?" tip is only useful while Win+V is not TapAct's yet.
  const winvHint = document.getElementById('winvHint');
  if (winvHint && /^Win\+/.test(shortcuts.history)) winvHint.hidden = true;

  applyTheme(boot.theme);
  applyLanguage(lang);
})();
