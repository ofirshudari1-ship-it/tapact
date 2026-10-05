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
      btn.textContent = a.label;
      btn.addEventListener('click', () => window.tapactAction.runAction(index));
      actionsList.appendChild(btn);
    });
  }

  settingsBtn.addEventListener('click', () => window.tapactAction.openSettings());
  closeBtn.addEventListener('click', () => window.tapactAction.dismiss());

  // Esc dismisses the popup, same as every other TapAct window/popup.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.tapactAction.dismiss(); });

  document.documentElement.addEventListener('mouseenter', () => window.tapactAction.setHover(true));
  document.documentElement.addEventListener('mouseleave', () => window.tapactAction.setHover(false));

  ['keydown', 'click'].forEach((evt) =>
    document.addEventListener(evt, () => window.tapactAction.notifyActivity())
  );
});
