// popup-shared.js - renderer-side helpers shared by the phone popup and the
// action popup (plain <script>, exposes window.TapActPopup):
//   - the snooze / skip menu (opens in place of the popup body)
//   - the thin auto-close countdown bar
//   - the one-time "popups paused for a minute" hint
// Each page passes the bridge object its own preload exposes (they share the
// method names hold / snooze / getCountdown / onCountdown).

(function () {
  const TYPE_NAME_KEYS = {
    phone: 'snooze.typeName.phone',
    tracking: 'snooze.typeName.tracking',
    address: 'snooze.typeName.address',
    url: 'snooze.typeName.url',
    email: 'snooze.typeName.email',
    datetime: 'snooze.typeName.datetime'
  };

  function tr(key) {
    const lang = document.documentElement.lang || 'he';
    return window.i18n ? window.i18n.t(lang, key) : key;
  }

  // ---- Snooze menu ----
  function initSnoozeMenu({ api, type, onLayout }) {
    const btn = document.getElementById('snoozeBtn');
    const panel = document.getElementById('snoozePanel');
    const app = document.querySelector('.app');
    if (!btn || !panel || !app) return { isOpen: () => false, close() {} };

    const typeBtn = document.getElementById('snoozeTypeBtn');
    const typeKey = TYPE_NAME_KEYS[type];
    if (typeBtn) {
      if (typeKey) {
        typeBtn.textContent = tr('snooze.type').replace('{type}', tr(typeKey));
      } else {
        typeBtn.classList.add('hidden'); // custom rules have no detector switch to turn off
        const hint = document.getElementById('snoozeUndoHint');
        if (hint) hint.classList.add('hidden');
      }
    }

    let open = false;
    const items = () => Array.from(panel.querySelectorAll('button:not(.hidden)'));

    function setOpen(next) {
      open = next;
      app.classList.toggle('snooze-open', open);
      panel.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
      api.hold('menu', open);
      if (open) { const first = items()[0]; if (first) first.focus(); } else btn.focus();
      if (onLayout) onLayout();
    }

    btn.addEventListener('click', () => setOpen(!open));
    panel.addEventListener('click', (e) => {
      const target = e.target.closest('button');
      if (!target) return;
      const kind = target.dataset.kind;
      if (kind === 'back') setOpen(false);
      else if (kind) api.snooze(kind);
    });
    document.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next].focus();
      }
    }, true);

    return { isOpen: () => open, close: () => { if (open) setOpen(false); } };
  }

  // ---- Countdown bar ----
  function initCountdown({ api }) {
    const bar = document.getElementById('countdown');
    if (!bar) return;
    const fill = bar.firstElementChild;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let anim = null;
    let stepTimer = null;

    function stop() {
      if (anim) { anim.cancel(); anim = null; }
      if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    }

    function apply(state) {
      stop();
      if (!state || !state.durationMs || state.paused) {
        bar.classList.add('idle'); // invisible while paused or when auto-close is off
        return;
      }
      bar.classList.remove('idle');
      const total = state.durationMs;
      const elapsed = Math.max(0, Date.now() - state.startedAt);
      const remaining = Math.max(0, total - elapsed);
      if (reduced) {
        // No motion: the bar steps down once per second instead of gliding.
        const draw = () => {
          const left = Math.max(0, total - (Date.now() - state.startedAt));
          fill.style.transform = `scaleX(${left / total})`;
        };
        draw();
        stepTimer = setInterval(draw, 1000);
        return;
      }
      anim = fill.animate(
        [{ transform: `scaleX(${remaining / total})` }, { transform: 'scaleX(0)' }],
        { duration: remaining, easing: 'linear', fill: 'forwards' }
      );
    }

    api.getCountdown().then(apply).catch(() => {});
    api.onCountdown(apply);
  }

  // Reasons that pause the countdown, reported to the main process (which owns
  // the real timer): pointer over the popup, a focused field, "more options".
  function initHolds({ api, moreOptions }) {
    document.documentElement.addEventListener('mouseenter', () => api.hold('hover', true));
    document.documentElement.addEventListener('mouseleave', () => api.hold('hover', false));
    document.addEventListener('focusin', (e) => {
      if (e.target && e.target.matches && e.target.matches('input, textarea, select')) api.hold('focus', true);
    });
    document.addEventListener('focusout', (e) => {
      if (e.target && e.target.matches && e.target.matches('input, textarea, select')) api.hold('focus', false);
    });
    if (moreOptions) moreOptions.addEventListener('toggle', () => api.hold('more', moreOptions.open));
  }

  function showBurstHint(show) {
    const el = document.getElementById('burstHint');
    if (el) el.classList.toggle('hidden', !show);
  }

  window.TapActPopup = { initSnoozeMenu, initCountdown, initHolds, showBurstHint };
})();
