document.addEventListener('DOMContentLoaded', async () => {
  const detectLabel = document.getElementById('detectLabel');
  const detectValue = document.getElementById('detectValue');
  const actionsList = document.getElementById('actionsList');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('closeBtn');

  const data = await window.tapactAction.getInitData();
  const action = data && data.action;

  // Follow the UI language, same as every other window (§4).
  let lang = 'en';
  if (typeof window.i18n !== 'undefined') {
    lang = (data.settings && data.settings.language) || 'en';
    window.i18n.applyI18n(lang);
  }

  if (action) {
    detectLabel.textContent = action.title || (window.i18n ? window.i18n.t(lang, 'action.detected') : 'Detected');
    detectValue.textContent = action.display || action.raw || '';
    detectValue.title = action.raw || '';

    (action.actions || []).forEach((a, index) => {
      const btn = document.createElement('button');
      btn.className = index === 0 ? 'btn primary' : 'btn secondary';
      if (index < 5) {
        const hint = document.createElement('span');
        hint.className = 'kbd-hint';
        hint.textContent = String(index + 1);
        hint.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = a.label;
        btn.appendChild(hint);
        btn.appendChild(label);
      } else {
        btn.textContent = a.label;
      }
      btn.addEventListener('click', () => window.tapactAction.runAction(index));
      actionsList.appendChild(btn);
    });
  }

  function fitWindow() {
    const header = document.querySelector('.app-header');
    const menuOpen = document.querySelector('.app').classList.contains('snooze-open');
    const body = menuOpen ? document.getElementById('snoozePanel') : document.querySelector('.body');
    if (!header || !body) return;
    // +3 for the thin accent strip above the header.
    window.tapactAction.fitHeight(header.offsetHeight + body.scrollHeight + 6);
  }
  window.TapActPopup.initSnoozeMenu({ api: window.tapactAction, type: data.type, onLayout: fitWindow });
  window.TapActPopup.initCountdown({ api: window.tapactAction });
  window.TapActPopup.initHolds({ api: window.tapactAction });
  window.TapActPopup.showBurstHint(!!data.burstNotice);
  fitWindow();

  settingsBtn.addEventListener('click', () => window.tapactAction.openSettings());
  closeBtn.addEventListener('click', () => window.tapactAction.dismiss());

  // Esc dismisses; 1-5 fire the nth action button without clicking.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { window.tapactAction.dismiss(); return; }
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (idx !== -1) {
        const btns = actionsList.querySelectorAll('.btn');
        if (btns[idx]) btns[idx].click();
      }
    }
  });

  ['keydown', 'click'].forEach((evt) =>
    document.addEventListener(evt, () => window.tapactAction.notifyActivity())
  );
});
