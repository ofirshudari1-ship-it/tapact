let templates = [];
let defaultId = null;
let settings = {};
let shortcuts = {};
let defaultShortcuts = { manual: 'CommandOrControl+Alt+P', history: 'Super+V', historyFallback: 'CommandOrControl+Alt+V' };
let tagRules = [];
let customRules = [];

const s = {};

// Accessible names for controls built in JS. They follow the UI language
// (document lang, set by i18n applyI18n) instead of being hardcoded Hebrew, so
// a screen reader in the English UI doesn't read Hebrew labels. Hebrew values
// are the strings these controls already used as aria-label/title.
const A11Y_STRINGS = {
  he: { moveUp: 'הזז למעלה', moveDown: 'הזז למטה', favAdd: 'הוסף למועדפים', favRemove: 'הסר מהמועדפים', remove: 'מחק', enabled: 'פעיל', templateName: 'שם התבנית', dragHint: 'גרור לשינוי סדר', copy: 'העתק' },
  en: { moveUp: 'Move up', moveDown: 'Move down', favAdd: 'Add to favorites', favRemove: 'Remove from favorites', remove: 'Delete', enabled: 'Enabled', templateName: 'Template name', dragHint: 'Drag to reorder', copy: 'Copy' }
};
function a11yT(key, subject) {
  const lang = document.documentElement.lang === 'en' ? 'en' : 'he';
  const base = A11Y_STRINGS[lang][key];
  const name = (subject || '').trim();
  return name ? `${base}: ${name}` : base;
}

const SHORTCUT_KEYS = { manual: 'shortcutManualInput', history: 'shortcutHistoryInput', historyFallback: 'shortcutFallbackInput' };
const SHORTCUT_STATUS_KEYS = { manual: 'shortcutManualStatus', history: 'shortcutHistoryStatus', historyFallback: 'shortcutFallbackStatus' };

// Shown as Ctrl/Win instead of Electron's CommandOrControl/Super; the stored
// value (shortcuts[field]) stays the Electron accelerator.
function displayShortcut(acc) {
  return typeof window.formatAccelerator === 'function' ? window.formatAccelerator(acc) : acc;
}

function acceleratorFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('CommandOrControl');
  if (e.metaKey) parts.push('Super');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.key;
  const modifierKeys = ['Control', 'Meta', 'Alt', 'Shift'];
  if (modifierKeys.includes(key)) return null; // wait for a real key on top of the modifiers
  const normalized = key.length === 1 ? key.toUpperCase() : key;
  parts.push(normalized);
  return parts.join('+');
}

function setupShortcutCapture(field) {
  const input = s[SHORTCUT_KEYS[field]];
  const startCapture = () => {
    if (input.classList.contains('capturing')) return; // already listening - don't stack a second keydown listener
    input.classList.add('capturing');
    input.value = clipT('shortcuts.recording');
    const onKey = (e) => {
      // Escape cancels capture instead of being recorded as the shortcut -
      // stopPropagation is required, not optional: the page-wide "Esc closes
      // Settings" handler below is on the bubble phase, and by the time it
      // ran, this same keydown had already cleared the 'capturing' class
      // (synchronously, in this same handler, during the capture phase that
      // always finishes before bubble starts) - so its `.capturing` guard
      // never actually caught this case and the window closed underneath
      // the user mid-capture. Stopping propagation here means that bubble
      // handler never sees this Escape at all.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        input.value = displayShortcut(shortcuts[field] || '');
        input.classList.remove('capturing');
        document.removeEventListener('keydown', onKey, true);
        return;
      }
      // Tab must keep doing normal focus navigation, never get captured as
      // a shortcut - Electron's globalShortcut is OS-wide, so accidentally
      // saving bare Tab here would intercept Tab everywhere on the system.
      if (e.key === 'Tab') return;
      e.preventDefault();
      const accelerator = acceleratorFromEvent(e);
      if (!accelerator) return;
      shortcuts[field] = accelerator;
      input.value = displayShortcut(accelerator);
      input.classList.remove('capturing');
      document.removeEventListener('keydown', onKey, true);
    };
    document.addEventListener('keydown', onKey, true);
  };
  input.addEventListener('click', startCapture);
  // Keyboard path: the field is readonly and capture used to start on mouse
  // click only, so a keyboard user could focus it but never set a shortcut.
  // Enter/Space starts capture; the NEXT key combo is what gets recorded.
  input.addEventListener('keydown', (e) => {
    if (input.classList.contains('capturing')) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    startCapture();
  });
}

// Hints like "open manually with {shortcut}" show the shortcut the user
// actually configured (it used to be hardcoded Ctrl+Alt+P / Ctrl+Alt+V).
// The key goes in an LTR-isolated <kbd>, so it never reorders inside Hebrew.
function renderShortcutHints() {
  const lang = document.documentElement.lang === 'he' ? 'he' : 'en';
  document.querySelectorAll('[data-i18n-shortcut]').forEach((el) => {
    const text = window.i18n ? window.i18n.t(lang, el.getAttribute('data-i18n-shortcut')) : '';
    const field = el.getAttribute('data-shortcut');
    const acc = (shortcuts && shortcuts[field]) || (defaultShortcuts && defaultShortcuts[field]) || '';
    el.textContent = '';
    text.split('{shortcut}').forEach((part, i, all) => {
      if (part) el.appendChild(document.createTextNode(part));
      if (i < all.length - 1) {
        const kbd = document.createElement('kbd');
        kbd.dir = 'ltr';
        kbd.textContent = displayShortcut(acc);
        el.appendChild(kbd);
      }
    });
  });
}

function renderShortcuts(status) {
  for (const field of Object.keys(SHORTCUT_KEYS)) {
    s[SHORTCUT_KEYS[field]].value = displayShortcut(shortcuts[field] || defaultShortcuts[field]);
    const statusEl = s[SHORTCUT_STATUS_KEYS[field]];
    if (status[field] === true) { statusEl.textContent = clipT('shortcuts.status.active'); statusEl.className = 'shortcut-status ok'; }
    else if (status[field] === false) { statusEl.textContent = clipT('shortcuts.status.taken'); statusEl.className = 'shortcut-status fail'; }
    else { statusEl.textContent = ''; statusEl.className = 'shortcut-status'; }
  }
  renderShortcutHints();
  // Hide the Win+V hint when it's actually registered
  if (s.shortcutHint) {
    s.shortcutHint.classList.toggle('hidden', status.history === true);
  }
}

async function onSaveShortcuts() {
  const result = await window.tapactSettings.saveShortcuts(shortcuts);
  renderShortcuts(result || {});
  s.savedShortcutsMsg.classList.remove('hidden');
  setTimeout(() => s.savedShortcutsMsg.classList.add('hidden'), 2200);
}

async function onResetShortcuts() {
  const result = await window.tapactSettings.resetShortcuts();
  shortcuts = { ...defaultShortcuts };
  renderShortcuts(result || {});
  s.savedShortcutsMsg.classList.remove('hidden');
  setTimeout(() => s.savedShortcutsMsg.classList.add('hidden'), 2200);
}

function renderTagRules() {
  s.tagRulesList.replaceChildren();
  for (const rule of tagRules) s.tagRulesList.appendChild(buildTagRuleCard(rule));
}

function buildTagRuleCard(rule) {
  const card = document.createElement('div');
  card.className = 'tag-card';

  const head = document.createElement('div');
  head.className = 'tag-card-head';

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = clipT('tags.placeholder.label');
  labelInput.value = rule.label;
  labelInput.style.flex = '1';
  labelInput.addEventListener('input', () => { rule.label = labelInput.value; });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn danger xs';
  removeBtn.textContent = clipT('rule.remove');
  removeBtn.setAttribute('aria-label', a11yT('remove', rule.label));
  removeBtn.addEventListener('click', () => {
    tagRules = tagRules.filter((r) => r !== rule);
    renderTagRules();
    s.addTagRuleBtn?.focus(); // the focused button was just removed from the DOM - don't drop focus to <body>
  });

  head.appendChild(labelInput);
  head.appendChild(removeBtn);

  const keywordsInput = document.createElement('input');
  keywordsInput.type = 'text';
  keywordsInput.placeholder = clipT('tags.placeholder.keywords');
  keywordsInput.value = (rule.keywords || []).join(', ');
  keywordsInput.style.width = '100%';
  keywordsInput.addEventListener('input', () => {
    rule.keywords = keywordsInput.value.split(',').map((k) => k.trim()).filter(Boolean);
  });

  card.appendChild(head);
  card.appendChild(keywordsInput);
  return card;
}

async function onSaveTagRules() {
  const result = await window.tapactSettings.saveTagRules(tagRules);
  if (Array.isArray(result)) tagRules = result;
  renderTagRules();
  s.savedTagRulesMsg.classList.remove('hidden');
  setTimeout(() => s.savedTagRulesMsg.classList.add('hidden'), 1800);
}

function renderCustomRules() {
  s.customRulesList.replaceChildren();
  customRules.forEach((rule, index) => {
    s.customRulesList.appendChild(buildCustomRuleCard(rule, index));
  });
}

// Custom rules are checked in array order and the FIRST match wins (see
// src/lib/detectors/index.js -> findCustomAction) - unlike the built-in
// detector toggles above (fixed code order, not user-configurable) or the
// message-template list (order is purely cosmetic there), list position
// here has real functional meaning. That's why this list gets drag-to-
// reorder and the others don't - see UPGRADE-REPORT.md for the reasoning.
function moveCustomRule(rule, delta) {
  const from = customRules.indexOf(rule);
  if (from === -1) return;
  const to = from + delta;
  if (to < 0 || to >= customRules.length) return;
  customRules.splice(from, 1);
  customRules.splice(to, 0, rule);
  renderCustomRules();
  // renderCustomRules() rebuilds every card, so the button that was just
  // pressed no longer exists and keyboard focus fell to <body>. Put focus back
  // on the same-direction button of the moved rule (or the other one once it
  // hits the top/bottom and that button is disabled) so the arrows can be
  // pressed repeatedly without re-tabbing through the list.
  const card = s.customRulesList.children[to];
  if (card) {
    let btn = card.querySelector(delta < 0 ? '.reorder-up' : '.reorder-down');
    if (!btn || btn.disabled) btn = card.querySelector(delta < 0 ? '.reorder-down' : '.reorder-up');
    btn?.focus();
  }
}

function buildCustomRuleCard(rule, index) {
  const card = document.createElement('div');
  card.className = 'tag-card';
  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (e) => e.preventDefault());
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isNaN(fromIndex) || fromIndex === index) return;
    const [moved] = customRules.splice(fromIndex, 1);
    customRules.splice(index, 0, moved);
    renderCustomRules();
  });

  const head = document.createElement('div');
  head.className = 'tag-card-head';

  // Drag handle (mouse) + up/down buttons (keyboard & screen-reader - native
  // HTML5 drag-and-drop isn't operable without a mouse, so reordering needs
  // a non-drag path too, not just a visual handle).
  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.setAttribute('aria-hidden', 'true');
  dragHandle.title = a11yT('dragHint');

  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'btn secondary xs reorder-btn reorder-up';
  moveUpBtn.textContent = '▲';
  moveUpBtn.setAttribute('aria-label', a11yT('moveUp', rule.label));
  moveUpBtn.title = a11yT('moveUp');
  moveUpBtn.disabled = index === 0;
  moveUpBtn.addEventListener('click', () => moveCustomRule(rule, -1));

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'btn secondary xs reorder-btn reorder-down';
  moveDownBtn.textContent = '▼';
  moveDownBtn.setAttribute('aria-label', a11yT('moveDown', rule.label));
  moveDownBtn.title = a11yT('moveDown');
  moveDownBtn.disabled = index === customRules.length - 1;
  moveDownBtn.addEventListener('click', () => moveCustomRule(rule, 1));

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = clipT('customRules.placeholder.label');
  labelInput.value = rule.label || '';
  labelInput.style.flex = '1';
  labelInput.addEventListener('input', () => { rule.label = labelInput.value; });

  const enabledSwitch = document.createElement('span');
  enabledSwitch.className = 'switch';
  const enabledInput = document.createElement('input');
  enabledInput.type = 'checkbox';
  enabledInput.checked = rule.enabled !== false;
  enabledInput.title = a11yT('enabled');
  enabledInput.setAttribute('aria-label', a11yT('enabled', rule.label)); // title alone is not a reliable accessible name (axe label-title-only)
  enabledInput.addEventListener('change', () => { rule.enabled = enabledInput.checked; });
  const enabledSlider = document.createElement('span');
  enabledSlider.className = 'slider';
  enabledSwitch.appendChild(enabledInput);
  enabledSwitch.appendChild(enabledSlider);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn danger xs';
  removeBtn.textContent = clipT('rule.remove');
  removeBtn.setAttribute('aria-label', a11yT('remove', rule.label));
  removeBtn.addEventListener('click', () => {
    customRules = customRules.filter((r) => r !== rule);
    renderCustomRules();
    s.addCustomRuleBtn?.focus();
  });

  head.appendChild(dragHandle);
  head.appendChild(moveUpBtn);
  head.appendChild(moveDownBtn);
  head.appendChild(labelInput);
  head.appendChild(enabledSwitch);
  head.appendChild(removeBtn);

  const patternInput = document.createElement('input');
  patternInput.type = 'text';
  patternInput.dir = 'ltr';
  patternInput.placeholder = clipT('customRules.placeholder.pattern');
  patternInput.value = rule.pattern || '';
  patternInput.style.width = '100%';
  patternInput.addEventListener('input', () => { rule.pattern = patternInput.value; });

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.dir = 'ltr';
  urlInput.placeholder = 'https://crm.example.com/orders/{value}';
  urlInput.value = rule.urlTemplate || '';
  urlInput.style.width = '100%';
  urlInput.addEventListener('input', () => { rule.urlTemplate = urlInput.value; });

  const actionLabelInput = document.createElement('input');
  actionLabelInput.type = 'text';
  actionLabelInput.placeholder = clipT('customRules.placeholder.actionLabel');
  actionLabelInput.value = rule.actionLabel || '';
  actionLabelInput.style.width = '100%';
  actionLabelInput.addEventListener('input', () => { rule.actionLabel = actionLabelInput.value; });

  card.appendChild(head);
  card.appendChild(patternInput);
  card.appendChild(urlInput);
  card.appendChild(actionLabelInput);
  return card;
}

async function onSaveCustomRules() {
  const result = await window.tapactSettings.saveCustomRules(customRules);
  if (Array.isArray(result)) customRules = result;
  renderCustomRules();
  s.savedCustomRulesMsg.classList.remove('hidden');
  setTimeout(() => s.savedCustomRulesMsg.classList.add('hidden'), 1800);
}

function timeAgoLabel(timestamp) {
  const mins = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (mins < 60) return clipT('clip.time.min').replace('{n}', mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return clipT('clip.time.hour').replace('{n}', hours);
  return clipT('clip.time.day').replace('{n}', Math.round(hours / 24));
}

document.addEventListener('DOMContentLoaded', async () => {
  s.list = document.getElementById('list');
  s.addBtn = document.getElementById('addBtn');
  s.defaultSelect = document.getElementById('defaultSelect');
  s.saveTemplatesBtn = document.getElementById('saveTemplatesBtn');
  s.resetBtn = document.getElementById('resetBtn');
  s.savedMsg = document.getElementById('savedMsg');
  s.favCapMsg = document.getElementById('favCapMsg');
  s.enabledCheck = document.getElementById('enabledCheck');
  s.autoLaunchCheck = document.getElementById('autoLaunchCheck');
  s.startMinimizedCheck = document.getElementById('startMinimizedCheck');
  s.closeToTrayCheck = document.getElementById('closeToTrayCheck');
  s.showTrayNotificationCheck = document.getElementById('showTrayNotificationCheck');
  s.soundOnDetectCheck = document.getElementById('soundOnDetectCheck');
  s.startPausedCheck = document.getElementById('startPausedCheck');
  s.trayClickSelect = document.getElementById('trayClickSelect');
  s.quietHoursEnabledCheck = document.getElementById('quietHoursEnabledCheck');
  s.quietHoursStartInput = document.getElementById('quietHoursStartInput');
  s.quietHoursEndInput = document.getElementById('quietHoursEndInput');
  s.saveQuietHoursBtn = document.getElementById('saveQuietHoursBtn');
  s.savedQuietHoursMsg = document.getElementById('savedQuietHoursMsg');
  s.languageSeg = document.getElementById('languageSeg');
  s.themeSeg = document.getElementById('themeSeg');
  s.langToggleBtn = document.getElementById('langToggleBtn');
  s.themeToggleBtn = document.getElementById('themeToggleBtn');
  s.pollInput = document.getElementById('pollInput');
  s.dedupeInput = document.getElementById('dedupeInput');
  s.autoCloseInput = document.getElementById('autoCloseInput');
  s.sendDedupeInput = document.getElementById('sendDedupeInput');
  s.saveSettingsBtn = document.getElementById('saveSettingsBtn');
  s.detectPhoneCheck = document.getElementById('detectPhoneCheck');
  s.detectTrackingCheck = document.getElementById('detectTrackingCheck');
  s.detectAddressCheck = document.getElementById('detectAddressCheck');
  s.detectUrlCheck = document.getElementById('detectUrlCheck');
  s.detectEmailCheck = document.getElementById('detectEmailCheck');
  s.detectDatetimeCheck = document.getElementById('detectDatetimeCheck');
  s.saveDetectorsBtn = document.getElementById('saveDetectorsBtn');
  s.savedDetectorsMsg = document.getElementById('savedDetectorsMsg');
  s.clipHistoryEnabledCheck = document.getElementById('clipHistoryEnabledCheck');
  s.clipHistoryStorageInput = document.getElementById('clipHistoryStorageInput');
  s.clipHistoryPreviewInput = document.getElementById('clipHistoryPreviewInput');
  s.saveClipHistorySettingsBtn = document.getElementById('saveClipHistorySettingsBtn');
  s.clearClipHistoryBtn = document.getElementById('clearClipHistoryBtn');
  s.savedClipHistoryMsg = document.getElementById('savedClipHistoryMsg');
  s.historyList = document.getElementById('historyList');
  s.historyEmpty = document.getElementById('historyEmpty');
  s.clearHistoryBtn = document.getElementById('clearHistoryBtn');
  s.exportCsvBtn = document.getElementById('exportCsvBtn');
  s.exportMsg = document.getElementById('exportMsg');
  s.versionLabel = document.getElementById('versionLabel');
  s.aboutVersion = document.getElementById('aboutVersion');
  s.aboutBuildDate = document.getElementById('aboutBuildDate');
  s.openChangelogBtn = document.getElementById('openChangelogBtn');
  s.openSiteBtn = document.getElementById('openSiteBtn');
  s.updateStatusText = document.getElementById('updateStatusText');
  s.checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
  s.updateLastChecked = document.getElementById('updateLastChecked');
  s.autoInstallUpdatesCheck = document.getElementById('autoInstallUpdatesCheck');
  s.exportDiagnosticsBtn = document.getElementById('exportDiagnosticsBtn');
  s.diagMsg = document.getElementById('diagMsg');
  s.shortcutManualInput = document.getElementById('shortcutManualInput');
  s.shortcutHistoryInput = document.getElementById('shortcutHistoryInput');
  s.shortcutFallbackInput = document.getElementById('shortcutFallbackInput');
  s.shortcutManualStatus = document.getElementById('shortcutManualStatus');
  s.shortcutHistoryStatus = document.getElementById('shortcutHistoryStatus');
  s.shortcutFallbackStatus = document.getElementById('shortcutFallbackStatus');
  s.saveShortcutsBtn = document.getElementById('saveShortcutsBtn');
  s.resetShortcutsBtn = document.getElementById('resetShortcutsBtn');
  s.savedShortcutsMsg = document.getElementById('savedShortcutsMsg');
  s.tagRulesList = document.getElementById('tagRulesList');
  s.addTagRuleBtn = document.getElementById('addTagRuleBtn');
  s.saveTagRulesBtn = document.getElementById('saveTagRulesBtn');
  s.savedTagRulesMsg = document.getElementById('savedTagRulesMsg');
  s.customRulesList = document.getElementById('customRulesList');
  s.addCustomRuleBtn = document.getElementById('addCustomRuleBtn');
  s.saveCustomRulesBtn = document.getElementById('saveCustomRulesBtn');
  s.savedCustomRulesMsg = document.getElementById('savedCustomRulesMsg');
  s.prefPhoneSelect = document.getElementById('prefPhoneSelect');
  s.prefAddressSelect = document.getElementById('prefAddressSelect');
  s.prefTrackingSelect = document.getElementById('prefTrackingSelect');
  s.prefEmailSelect = document.getElementById('prefEmailSelect');
  s.autoRunCheck = document.getElementById('autoRunCheck');
  s.autoRunDelayInput = document.getElementById('autoRunDelayInput');
  s.saveActionPrefsBtn = document.getElementById('saveActionPrefsBtn');
  s.savedActionPrefsMsg = document.getElementById('savedActionPrefsMsg');
  s.savedSettingsMsg = document.getElementById('savedSettingsMsg');
  s.shortcutHint = document.getElementById('shortcutHint');

  setupTabs();
  initClipHistoryPanel();

  const data = await window.tapactSettings.getData();
  templates = data.templates.map(t => ({ ...t }));
  defaultId = data.defaultTemplateId;
  settings = data.settings;
  s.versionLabel.textContent = data.version ? `v${data.version}` : '';
  if (s.aboutVersion) s.aboutVersion.textContent = data.version ? `v${data.version}` : '—';
  if (s.aboutBuildDate) s.aboutBuildDate.textContent = data.buildDate || '—';
  if (s.openChangelogBtn) s.openChangelogBtn.addEventListener('click', () => {
    window.tapactSettings.openExternal && window.tapactSettings.openExternal('changelog');
  });
  if (s.openSiteBtn) s.openSiteBtn.addEventListener('click', () => {
    window.tapactSettings.openExternal && window.tapactSettings.openExternal('site');
  });
  initUpdateSection();
  if (s.exportDiagnosticsBtn) s.exportDiagnosticsBtn.addEventListener('click', onExportDiagnostics);

  s.enabledCheck.checked = settings.enabled;
  if (window.tapactSettings.onMonitoringChanged) {
    window.tapactSettings.onMonitoringChanged((enabled) => {
      settings.enabled = enabled;
      s.enabledCheck.checked = enabled;
    });
  }
  s.autoLaunchCheck.checked = settings.autoLaunch;
  s.pollInput.value = settings.pollMs;
  s.dedupeInput.value = settings.dedupeSeconds;
  s.autoCloseInput.value = settings.autoCloseSeconds;
  s.sendDedupeInput.value = settings.sendDedupeMinutes;

  const detectors = settings.detectors || {};
  s.detectPhoneCheck.checked = detectors.phone !== false;
  s.detectTrackingCheck.checked = detectors.tracking !== false;
  s.detectAddressCheck.checked = detectors.address !== false;
  s.detectUrlCheck.checked = detectors.url !== false;
  s.detectEmailCheck.checked = detectors.email !== false;
  s.detectDatetimeCheck.checked = detectors.datetime !== false;

  s.clipHistoryEnabledCheck.checked = settings.historyEnabled !== false;
  s.clipHistoryStorageInput.value = settings.historyStorageLimit || 1000;
  s.clipHistoryPreviewInput.value = settings.historyPreviewLimit || 50;

  const prefs = settings.actionPreferences || {};
  s.prefPhoneSelect.value = prefs.phone || '';
  s.prefAddressSelect.value = prefs.address || '';
  s.prefTrackingSelect.value = prefs.tracking || '';
  s.prefEmailSelect.value = prefs.email || '';
  s.autoRunCheck.checked = settings.autoRunAction === true;
  s.autoRunDelayInput.value = settings.autoRunDelaySeconds || 4;

  // New settings
  if (s.startMinimizedCheck) s.startMinimizedCheck.checked = settings.startMinimized === true;
  if (s.closeToTrayCheck) s.closeToTrayCheck.checked = settings.closeToTray !== false;
  if (s.showTrayNotificationCheck) s.showTrayNotificationCheck.checked = settings.showTrayNotification !== false;
  if (s.soundOnDetectCheck) s.soundOnDetectCheck.checked = settings.soundOnDetect === true;
  if (s.startPausedCheck) s.startPausedCheck.checked = settings.startPaused === true;
  if (s.trayClickSelect) s.trayClickSelect.value = settings.trayClickAction || 'history';
  if (s.autoInstallUpdatesCheck) s.autoInstallUpdatesCheck.checked = settings.autoInstallUpdates !== false;

  const quietHours = settings.quietHours || {};
  if (s.quietHoursEnabledCheck) s.quietHoursEnabledCheck.checked = quietHours.enabled === true;
  if (s.quietHoursStartInput) s.quietHoursStartInput.value = quietHours.start || '18:00';
  if (s.quietHoursEndInput) s.quietHoursEndInput.value = quietHours.end || '08:00';

  // Language & theme
  const currentLang = settings.language || 'en';
  const currentTheme = settings.theme || 'dark';
  applyAppLanguage(currentLang);
  applyAppTheme(currentTheme);
  // Display density (comfortable/compact) is a per-machine viewing
  // preference, not app data - kept in localStorage (like a remembered
  // window position) instead of round-tripping through settings:save-settings.
  applyAppDensity(readStoredDensity());

  defaultShortcuts = data.defaultShortcuts || defaultShortcuts;
  shortcuts = { ...defaultShortcuts, ...(settings.shortcuts || {}) };
  renderShortcuts(data.shortcutStatus || {});

  tagRules = await window.tapactSettings.getTagRules();
  renderTagRules();

  customRules = await window.tapactSettings.getCustomRules();
  renderCustomRules();

  render();
  await renderHistory();

  s.addBtn.addEventListener('click', () => {
    templates.push({ id: `custom-${Date.now()}`, label: clipT('templates.new.label'), text: '' });
    render();
  });
  s.saveTemplatesBtn.addEventListener('click', onSaveTemplates);
  s.resetBtn.addEventListener('click', onReset);
  s.saveSettingsBtn.addEventListener('click', onSaveSettings);
  if (s.saveQuietHoursBtn) s.saveQuietHoursBtn.addEventListener('click', onSaveQuietHours);
  s.saveDetectorsBtn.addEventListener('click', onSaveDetectors);
  s.saveClipHistorySettingsBtn.addEventListener('click', onSaveClipHistorySettings);
  s.clearClipHistoryBtn.addEventListener('click', onClearClipHistory);
  setupShortcutCapture('manual');
  setupShortcutCapture('history');
  setupShortcutCapture('historyFallback');
  s.saveShortcutsBtn.addEventListener('click', onSaveShortcuts);
  s.resetShortcutsBtn.addEventListener('click', onResetShortcuts);
  s.addTagRuleBtn.addEventListener('click', () => {
    tagRules.push({ id: `rule-${Date.now()}`, label: '', keywords: [] });
    renderTagRules();
  });
  s.saveTagRulesBtn.addEventListener('click', onSaveTagRules);
  s.addCustomRuleBtn.addEventListener('click', () => {
    customRules.push({ id: `rule-${Date.now()}`, label: '', pattern: '', urlTemplate: '', actionLabel: '', enabled: true });
    renderCustomRules();
  });
  s.saveCustomRulesBtn.addEventListener('click', onSaveCustomRules);
  s.saveActionPrefsBtn.addEventListener('click', onSaveActionPrefs);
  s.clearHistoryBtn.addEventListener('click', onClearHistory);
  s.exportCsvBtn.addEventListener('click', onExportCsv);

  // Language & theme toggles
  if (s.langToggleBtn) {
    s.langToggleBtn.addEventListener('click', () => {
      const cur = document.documentElement.lang || 'en';
      const next = cur === 'he' ? 'en' : 'he';
      applyAppLanguage(next);
      saveSetting('language', next);
    });
  }
  if (s.themeToggleBtn) {
    s.themeToggleBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      applyAppTheme(next);
      saveSetting('theme', next);
    });
  }
  document.querySelectorAll('#languageSeg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyAppLanguage(btn.dataset.val);
      saveSetting('language', btn.dataset.val);
    });
  });
  document.querySelectorAll('#themeSeg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyAppTheme(btn.dataset.val);
      saveSetting('theme', btn.dataset.val);
    });
  });
  document.querySelectorAll('#densitySeg .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyAppDensity(btn.dataset.val);
      writeStoredDensity(btn.dataset.val);
    });
  });
  document.getElementById('footerLang')?.addEventListener('click', () => {
    const cur = document.documentElement.lang || 'en';
    const next = cur === 'he' ? 'en' : 'he';
    applyAppLanguage(next);
    saveSetting('language', next);
  });

  // Lead settings
  s.leadChWhatsapp = document.getElementById('leadChWhatsapp');
  s.leadWhatsappNumber = document.getElementById('leadWhatsappNumber');
  s.leadWhatsappRow = document.getElementById('leadWhatsappRow');
  s.leadChWebhook = document.getElementById('leadChWebhook');
  s.leadWebhookRows = document.getElementById('leadWebhookRows');
  s.leadWebhookUrl = document.getElementById('leadWebhookUrl');
  s.leadWebhookHeaderName = document.getElementById('leadWebhookHeaderName');
  s.leadWebhookHeaderValue = document.getElementById('leadWebhookHeaderValue');
  s.leadChSlack = document.getElementById('leadChSlack');
  s.leadSlackRow = document.getElementById('leadSlackRow');
  s.leadSlackWebhookUrl = document.getElementById('leadSlackWebhookUrl');
  s.leadChEmail = document.getElementById('leadChEmail');
  s.leadEmailRow = document.getElementById('leadEmailRow');
  s.leadEmailAddress = document.getElementById('leadEmailAddress');
  s.leadChCopy = document.getElementById('leadChCopy');
  s.leadMessageTemplate = document.getElementById('leadMessageTemplate');
  s.leadAiEnabled = document.getElementById('leadAiEnabled');
  s.leadAiApiKey = document.getElementById('leadAiApiKey');
  s.leadAiKeyRow = document.getElementById('leadAiKeyRow');
  s.leadDupWindow = document.getElementById('leadDupWindow');
  s.leadCustomSources = document.getElementById('leadCustomSources');
  s.saveLeadSettingsBtn = document.getElementById('saveLeadSettingsBtn');
  s.savedLeadMsg = document.getElementById('savedLeadMsg');
  s.clearLeadHistoryBtn = document.getElementById('clearLeadHistoryBtn');
  s.exportLeadCsvBtn = document.getElementById('exportLeadCsvBtn');
  s.exportLeadMsg = document.getElementById('exportLeadMsg');
  s.leadHistoryList = document.getElementById('leadHistoryList');
  s.leadHistoryEmpty = document.getElementById('leadHistoryEmpty');

  const ls = await window.tapactSettings.getLeadSettings();
  applyLeadSettings(ls);

  s.leadChWhatsapp.addEventListener('change', () => s.leadWhatsappRow.classList.toggle('hidden', !s.leadChWhatsapp.checked));
  s.leadChWebhook.addEventListener('change', () => s.leadWebhookRows.classList.toggle('hidden', !s.leadChWebhook.checked));
  s.leadChSlack.addEventListener('change', () => s.leadSlackRow.classList.toggle('hidden', !s.leadChSlack.checked));
  s.leadChEmail.addEventListener('change', () => s.leadEmailRow.classList.toggle('hidden', !s.leadChEmail.checked));
  s.leadAiEnabled.addEventListener('change', () => s.leadAiKeyRow.classList.toggle('hidden', !s.leadAiEnabled.checked));

  s.testWebhookBtn = document.getElementById('testWebhookBtn');
  s.testWebhookMsg = document.getElementById('testWebhookMsg');
  s.testSlackBtn = document.getElementById('testSlackBtn');
  s.testSlackMsg = document.getElementById('testSlackMsg');

  s.saveLeadSettingsBtn.addEventListener('click', onSaveLeadSettings);
  s.clearLeadHistoryBtn.addEventListener('click', onClearLeadHistory);
  s.exportLeadCsvBtn.addEventListener('click', onExportLeadCsv);
  s.testWebhookBtn.addEventListener('click', () => onTestChannel('webhook'));
  s.testSlackBtn.addEventListener('click', () => onTestChannel('slack'));

  // Esc closes the Settings window, same as every other TapAct window/
  // popup — but not while a keyboard-shortcut field is actively capturing a
  // key combo (there, Escape is a candidate key for the shortcut itself).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.shortcut-input.capturing')) return;
    window.close();
  });

  await renderLeadHistory();
});

function setupTabs() {
  const buttons = document.querySelectorAll('.nav-btn');
  buttons.forEach((b) => { if (b.classList.contains('active')) b.setAttribute('aria-current', 'page'); });
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
      btn.classList.add('active');
      // Screen readers announce which section is showing (the .active class
      // is visual-only), and High Contrast mode styles off this too.
      btn.setAttribute('aria-current', 'page');
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${btn.dataset.tab}`);
      });
      // All tabs share one scrollable .content column. Without this, switching
      // to a new tab kept whatever scroll position the previous (longer or
      // shorter) tab was left at, so the new tab could open mid-scroll,
      // looking like its top controls had vanished - part of what made the
      // window feel confusing ("not clear what to do").
      document.querySelector('.content')?.scrollTo({ top: 0 });
    });
  });
}

// --- Clipboard history list (Settings ▸ היסטוריית לוח) ---
// Rendered as real DOM directly inside this tab (ported from
// clipboard-history/clipboard-history.js, which still drives the separate
// standalone quick-access popup unchanged) instead of a BrowserView layered
// on top - see settings/preload.js for the shared history-panel:* IPC.
const CLIP_CATEGORY_ICON = { phone: '📞', tracking: '📦', address: '🗺️', url: '🔗', email: '✉️', custom: '⚡', text: '📋' };
let clipItems = [];
let clipTotal = 0;
let clipPageSize = 50;
let clipHistoryPanelEnabled = true;
let clipActiveCategory = 'all';
let clipSearchTerm = '';

function clipT(key) {
  const lang = (settings && settings.language) || 'en';
  return window.i18n ? window.i18n.t(lang, key) : key;
}

// Real update status (About tab) - reflects the actual electron-updater
// instance in main.js via update:get-status/update:check-now/
// update:status-changed (see preload.js), not a mock. renderUpdateStatus
// is also the live push handler, so a check started from another window
// (or from the silent startup check) still updates this one if it's open.
function renderUpdateStatus(status) {
  if (!s.updateStatusText) return;
  const st = status || { state: 'idle' };
  let text;
  switch (st.state) {
    case 'checking': text = clipT('update.status.checking'); break;
    case 'up-to-date': text = clipT('update.status.upToDate'); break;
    case 'downloading': text = clipT('update.status.downloading').replace('{percent}', String(st.progress || 0)); break;
    case 'ready': text = clipT('update.status.ready'); break;
    case 'error': text = clipT('update.status.error'); break;
    default: text = st.lastCheckedAt ? clipT('update.status.upToDate') : clipT('update.status.neverChecked');
  }
  s.updateStatusText.textContent = text;
  if (s.updateLastChecked) {
    s.updateLastChecked.textContent = st.lastCheckedAt ? clipTimeAgoLabel(st.lastCheckedAt) : clipT('update.status.neverChecked');
  }
  if (s.checkUpdatesBtn) s.checkUpdatesBtn.disabled = st.state === 'checking' || st.state === 'downloading';
}

async function initUpdateSection() {
  // Saves immediately on toggle (like checkUpdatesBtn below) rather than
  // waiting for a tab's bulk Save button - this checkbox lives in the About
  // tab's Updates panel, not inside a form. Its checked state was already
  // set from the loaded settings in render() above; this only wires the
  // change handler. Guarded separately from the getUpdateStatus check below
  // since it doesn't depend on the live update-status feed.
  if (s.autoInstallUpdatesCheck && window.tapactSettings.setAutoInstallUpdates) {
    s.autoInstallUpdatesCheck.addEventListener('change', () => {
      window.tapactSettings.setAutoInstallUpdates(s.autoInstallUpdatesCheck.checked);
    });
  }

  if (!window.tapactSettings.getUpdateStatus) return; // preload not updated yet (dev skew guard)
  const initial = await window.tapactSettings.getUpdateStatus();
  renderUpdateStatus(initial);
  window.tapactSettings.onUpdateStatusChanged(renderUpdateStatus);
  if (s.checkUpdatesBtn) {
    s.checkUpdatesBtn.addEventListener('click', async () => {
      renderUpdateStatus({ state: 'checking' });
      await window.tapactSettings.checkForUpdatesNow();
      // Real result arrives via onUpdateStatusChanged above - this call just
      // triggers the check, it doesn't itself resolve with the outcome.
    });
  }
}

function initClipHistoryPanel() {
  s.clipSearchInput = document.getElementById('clipSearchInput');
  s.clipFilters = document.getElementById('clipFilters');
  s.clipCountLabel = document.getElementById('clipCountLabel');
  s.clipHistoryList = document.getElementById('clipHistoryList');
  s.clipEmptyState = document.getElementById('clipEmptyState');
  s.clipEmptyStateText = document.getElementById('clipEmptyStateText');
  s.clipPauseDot = document.getElementById('clipPauseDot');
  s.clipStatusText = document.getElementById('clipStatusText');
  s.clipToggleBtn = document.getElementById('clipToggleBtn');
  s.clipClearAllBtn = document.getElementById('clipClearAllBtn');
  if (!s.clipSearchInput || !window.tapactSettings.clipHistoryGetData) return;

  document.querySelectorAll('.clip-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.classList.contains('active'))));

  s.clipSearchInput.addEventListener('input', () => {
    clipSearchTerm = s.clipSearchInput.value.trim().toLowerCase();
    renderClipHistory();
  });

  s.clipFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.clip-chip');
    if (!btn) return;
    clipActiveCategory = btn.dataset.cat;
    document.querySelectorAll('.clip-chip').forEach((c) => {
      c.classList.toggle('active', c === btn);
      c.setAttribute('aria-pressed', String(c === btn));
    });
    renderClipHistory();
  });

  s.clipClearAllBtn.addEventListener('click', () => {
    window.tapactSettings.clipHistoryClearAll();
    clipItems = [];
    clipTotal = 0;
    renderClipHistory();
  });

  s.clipToggleBtn.addEventListener('click', () => {
    clipHistoryPanelEnabled = !clipHistoryPanelEnabled;
    window.tapactSettings.clipHistoryToggleEnabled(clipHistoryPanelEnabled);
    updateClipHistoryStatus();
    // Keep the "storage settings" panel's own switch (further down this
    // same tab) truthful too - they both control the one historyEnabled flag.
    if (s.clipHistoryEnabledCheck) s.clipHistoryEnabledCheck.checked = clipHistoryPanelEnabled;
  });

  window.tapactSettings.onClipHistoryItemsChanged(async () => {
    await loadClipHistory(clipPageSize);
    renderClipHistory();
  });

  loadClipHistory().then(renderClipHistory);
}

async function loadClipHistory(limit) {
  const data = await window.tapactSettings.clipHistoryGetData(limit);
  clipItems = data.items || [];
  clipTotal = data.total || clipItems.length;
  clipPageSize = limit || clipItems.length || 50;
  clipHistoryPanelEnabled = data.historyEnabled !== false;
  updateClipHistoryStatus();
}

function updateClipHistoryStatus() {
  if (!s.clipPauseDot) return;
  s.clipPauseDot.classList.toggle('paused', !clipHistoryPanelEnabled);
  s.clipStatusText.textContent = clipHistoryPanelEnabled ? clipT('clip.panel.recording') : clipT('clip.panel.paused');
  s.clipToggleBtn.textContent = clipHistoryPanelEnabled ? clipT('clip.pause') : clipT('clip.resume');
}

function clipTimeAgoLabel(timestamp) {
  const mins = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (mins < 1) return clipT('clip.time.now');
  if (mins < 60) return clipT('clip.time.min').replace('{n}', mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return clipT('clip.time.hour').replace('{n}', hours);
  return clipT('clip.time.day').replace('{n}', Math.round(hours / 24));
}

function clipFullDateLabel(timestamp) {
  const lang = (settings && settings.language) || 'en';
  return new Date(timestamp).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function clipMatchesSearch(item, term) {
  if (!term) return true;
  if (item.text.toLowerCase().includes(term)) return true;
  return (item.tags || []).some((t) => t.toLowerCase().includes(term));
}

function renderClipHistory() {
  if (!s.clipHistoryList) return;
  const filtered = clipItems.filter((item) => {
    if (clipActiveCategory !== 'all' && item.category !== clipActiveCategory) return false;
    if (!clipMatchesSearch(item, clipSearchTerm)) return false;
    return true;
  });

  s.clipHistoryList.replaceChildren();
  const hasResults = filtered.length > 0;
  s.clipEmptyState.classList.toggle('hidden', hasResults);
  s.clipHistoryList.classList.toggle('hidden', !hasResults);
  if (!hasResults) {
    const isFiltered = Boolean(clipSearchTerm) || clipActiveCategory !== 'all';
    s.clipEmptyStateText.textContent = isFiltered ? clipT('clip.panel.emptyFiltered') : clipT('clip.panel.empty');
  }
  s.clipCountLabel.textContent = clipTotal > clipItems.length
    ? clipT('clip.panel.countShowing').replace('{shown}', clipItems.length).replace('{total}', clipTotal)
    : clipT('clip.panel.countTotal').replace('{n}', clipTotal);

  for (const item of filtered) {
    s.clipHistoryList.appendChild(buildClipRow(item));
  }

  if (clipItems.length < clipTotal && !clipSearchTerm && clipActiveCategory === 'all') {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'clip-load-more';
    loadMoreBtn.textContent = clipT('clip.panel.loadMore').replace('{n}', clipTotal - clipItems.length);
    loadMoreBtn.addEventListener('click', async () => {
      await loadClipHistory(clipPageSize + 50);
      renderClipHistory();
    });
    s.clipHistoryList.appendChild(loadMoreBtn);
  }
}

function buildClipRow(item) {
  const row = document.createElement('div');
  row.className = 'clip-item';

  const icon = document.createElement('span');
  icon.className = 'clip-item-icon';
  icon.textContent = CLIP_CATEGORY_ICON[item.category] || '📋';

  const content = document.createElement('div');
  content.className = 'clip-item-content';
  // Keyboard-operable copy target. It used to be the whole row with
  // role=button, but the row also contains the run/delete buttons, and a
  // button inside a button is announced ambiguously by screen readers (axe
  // nested-interactive). The text block is now the copy button and the
  // action buttons are its siblings. Mouse click anywhere on the row still copies.
  content.tabIndex = 0;
  content.setAttribute('role', 'button');
  content.setAttribute('aria-label', a11yT('copy', item.text));
  const text = document.createElement('div');
  text.className = 'clip-item-text';
  text.textContent = item.text;
  const meta = document.createElement('div');
  meta.className = 'clip-item-meta';
  meta.title = clipFullDateLabel(item.copiedAt);
  meta.textContent = `${clipTimeAgoLabel(item.copiedAt)} · ${clipFullDateLabel(item.copiedAt)}`;
  content.appendChild(text);
  content.appendChild(meta);

  if (item.tags && item.tags.length) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'clip-tags-row';
    for (const tag of item.tags) {
      const chip = document.createElement('span');
      chip.className = 'clip-tag-chip';
      chip.textContent = tag;
      tagsRow.appendChild(chip);
    }
    content.appendChild(tagsRow);
  }

  const actions = document.createElement('div');
  actions.className = 'clip-item-actions';

  if (item.actions && item.actions.length) {
    const goBtn = document.createElement('button');
    goBtn.className = 'clip-go';
    goBtn.title = item.actions[0].label;
    goBtn.setAttribute('aria-label', item.actions[0].label);
    goBtn.textContent = '▶';
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.tapactSettings.clipHistoryRunAction(item.id, 0);
    });
    actions.appendChild(goBtn);
  }

  const delBtn = document.createElement('button');
  const deleteLabel = clipT('clip.panel.delete');
  delBtn.title = deleteLabel;
  delBtn.setAttribute('aria-label', deleteLabel);
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tapactSettings.clipHistoryDeleteItem(item.id);
    clipItems = clipItems.filter((i) => i.id !== item.id);
    clipTotal = Math.max(0, clipTotal - 1);
    renderClipHistory();
  });
  actions.appendChild(delBtn);

  row.appendChild(icon);
  row.appendChild(content);
  row.appendChild(actions);

  row.addEventListener('click', () => window.tapactSettings.clipHistoryCopyItem(item.id));
  content.addEventListener('keydown', (e) => {
    if (e.target !== content) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space must not also scroll the list
    window.tapactSettings.clipHistoryCopyItem(item.id);
  });

  return row;
}

const MAX_FAVORITE_TEMPLATES = 3; // TapAct has no floating quick-access widget like the competitor's - favoriting a template is the closest equivalent ("surface my most-used ones"), capped small on purpose so it stays a quick scan, not a second full list

function orderedTemplatesForDisplay() {
  // Favorited templates float to the top (stable otherwise) - the actual
  // saved array order is untouched, this only affects what's rendered.
  return [...templates].sort((a, b) => Number(b.favorite === true) - Number(a.favorite === true));
}

function render() {
  s.list.replaceChildren();
  for (const t of orderedTemplatesForDisplay()) s.list.appendChild(buildCard(t));
  renderDefaultSelect();
}

function buildCard(template) {
  const card = document.createElement('div');
  card.className = 'card';
  if (template.favorite) card.classList.add('favorited');

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'fav-star-btn';
  const isFav = template.favorite === true;
  favBtn.textContent = isFav ? '★' : '☆';
  favBtn.classList.toggle('active', isFav);
  favBtn.dataset.templateId = template.id;
  favBtn.setAttribute('aria-pressed', String(isFav));
  favBtn.setAttribute('aria-label', a11yT(isFav ? 'favRemove' : 'favAdd', template.label));
  favBtn.title = a11yT(isFav ? 'favRemove' : 'favAdd');
  favBtn.addEventListener('click', () => {
    if (!template.favorite) {
      const favCount = templates.filter((t) => t.favorite).length;
      if (favCount >= MAX_FAVORITE_TEMPLATES) { flashMsg(s.favCapMsg); return; } // cap so the "top of list" stays meaningful
    }
    template.favorite = !template.favorite;
    render();
    // render() rebuilt the list (and re-sorted it - the card may have moved),
    // so refocus this template's star instead of letting focus drop to <body>.
    s.list.querySelector(`.fav-star-btn[data-template-id="${CSS.escape(template.id)}"]`)?.focus();
  });

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'label-input';
  labelInput.id = `tplLabel-${template.id}`;
  labelInput.setAttribute('aria-label', a11yT('templateName'));
  labelInput.value = template.label;

  const textArea = document.createElement('textarea');
  // The message text is named by its template's name field (e.g. "פנייה ראשונה").
  textArea.setAttribute('aria-labelledby', labelInput.id);
  textArea.rows = 3;
  textArea.value = template.text;
  textArea.addEventListener('input', () => { template.text = textArea.value; });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn danger small';
  removeBtn.textContent = clipT('templates.remove');
  removeBtn.setAttribute('aria-label', a11yT('remove', template.label));
  removeBtn.addEventListener('click', () => {
    templates = templates.filter(t => t.id !== template.id);
    if (defaultId === template.id) defaultId = templates[0] ? templates[0].id : null;
    render();
    s.addBtn?.focus();
  });

  labelInput.addEventListener('input', () => {
    template.label = labelInput.value;
    renderDefaultSelect();
    // keep the per-card button names in step with the renamed template
    favBtn.setAttribute('aria-label', a11yT(template.favorite ? 'favRemove' : 'favAdd', template.label));
    removeBtn.setAttribute('aria-label', a11yT('remove', template.label));
  });

  const row = document.createElement('div');
  row.className = 'card-head';
  row.appendChild(favBtn);
  row.appendChild(labelInput);
  row.appendChild(removeBtn);

  card.appendChild(row);
  card.appendChild(textArea);
  return card;
}

function renderDefaultSelect() {
  s.defaultSelect.replaceChildren();
  for (const t of templates) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    s.defaultSelect.appendChild(opt);
  }
  if (templates.some(t => t.id === defaultId)) {
    s.defaultSelect.value = defaultId;
  } else if (templates[0]) {
    defaultId = templates[0].id;
    s.defaultSelect.value = defaultId;
  }
  s.defaultSelect.onchange = () => { defaultId = s.defaultSelect.value; };
}

function onSaveTemplates() {
  const cleaned = templates
    .map(t => ({ id: t.id, label: t.label.trim() || clipT('templates.unnamed'), text: t.text, favorite: t.favorite === true }))
    .filter(t => t.text.trim().length > 0 || t.label.trim().length > 0);
  window.tapactSettings.saveTemplates(cleaned, defaultId);
  flashSaved();
}

async function onReset() {
  if (!confirm(clipT('templates.resetConfirm'))) return;
  window.tapactSettings.resetTemplates();
  const data = await window.tapactSettings.getData();
  templates = data.templates.map(t => ({ ...t }));
  defaultId = data.defaultTemplateId;
  render();
  flashSaved();
}

function onSaveSettings() {
  window.tapactSettings.saveSettings({
    enabled: s.enabledCheck.checked,
    autoLaunch: s.autoLaunchCheck.checked,
    startMinimized: s.startMinimizedCheck ? s.startMinimizedCheck.checked : false,
    closeToTray: s.closeToTrayCheck ? s.closeToTrayCheck.checked : true,
    showTrayNotification: s.showTrayNotificationCheck ? s.showTrayNotificationCheck.checked : true,
    soundOnDetect: s.soundOnDetectCheck ? s.soundOnDetectCheck.checked : false,
    startPaused: s.startPausedCheck ? s.startPausedCheck.checked : false,
    trayClickAction: s.trayClickSelect ? s.trayClickSelect.value : 'history',
    pollMs: Math.max(200, Number(s.pollInput.value) || 800),
    dedupeSeconds: Math.max(0, Number(s.dedupeInput.value) || 0),
    autoCloseSeconds: Math.max(0, Number(s.autoCloseInput.value) || 0),
    sendDedupeMinutes: Math.max(0, Number(s.sendDedupeInput.value) || 0)
  });
  flashMsg(s.savedSettingsMsg);
}

function onSaveQuietHours() {
  window.tapactSettings.saveSettings({
    quietHours: {
      enabled: s.quietHoursEnabledCheck ? s.quietHoursEnabledCheck.checked : false,
      start: (s.quietHoursStartInput && s.quietHoursStartInput.value) || '18:00',
      end: (s.quietHoursEndInput && s.quietHoursEndInput.value) || '08:00'
    }
  });
  flashMsg(s.savedQuietHoursMsg);
}

function applyAppLanguage(lang) {
  if (typeof window.i18n === 'undefined') return;
  window.i18n.applyI18n(lang);
  renderShortcutHints();
  // The window's title bar/taskbar text: main.js's openSettingsWindow() sets
  // an initial BrowserWindow `title`, but Electron overwrites it with this
  // page's own <title> once settings.html finishes loading - so without
  // this, the title bar stayed hardcoded Hebrew ("TapAct - הגדרות")
  // regardless of language, same leak class as the tray menu.
  document.title = window.i18n.t(lang, 'settings.windowTitle');
  // Update segmented controls
  document.querySelectorAll('#languageSeg .seg-btn').forEach((b) => { b.classList.toggle('active', b.dataset.val === lang); b.setAttribute('aria-pressed', String(b.dataset.val === lang)); });
  // Update header pill text
  if (s.langToggleBtn) s.langToggleBtn.textContent = lang === 'he' ? '🌐 EN' : '🌐 עב';
  // The clip-history list's rows/status/counts are built in JS (not
  // data-i18n markup), so applyI18n() above doesn't touch them - refresh
  // them explicitly whenever the language changes.
  updateClipHistoryStatus();
  renderClipHistory();
  // Accessible names on the JS-built template / custom-rule cards come from
  // a11yT(), which reads the document language - rebuild them so a screen
  // reader hears the new language too (list state lives in the arrays, not the DOM).
  if (s.list) render();
  if (s.customRulesList) renderCustomRules();
}

function applyAppTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Update segmented controls
  document.querySelectorAll('#themeSeg .seg-btn').forEach((b) => { b.classList.toggle('active', b.dataset.val === theme); b.setAttribute('aria-pressed', String(b.dataset.val === theme)); });
  // Update header pill
  if (s.themeToggleBtn) s.themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function saveSetting(key, value) {
  window.tapactSettings.saveSettings({ [key]: value });
}

const DENSITY_STORAGE_KEY = 'tapact.settings.density';

function readStoredDensity() {
  try {
    const v = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return v === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable'; // localStorage can throw (e.g. disabled) - fall back quietly
  }
}

function writeStoredDensity(value) {
  try { window.localStorage.setItem(DENSITY_STORAGE_KEY, value); } catch { /* best-effort */ }
}

function applyAppDensity(density) {
  document.documentElement.setAttribute('data-density', density === 'compact' ? 'compact' : 'comfortable');
  document.querySelectorAll('#densitySeg .seg-btn').forEach((b) => { const on = b.dataset.val === (density === 'compact' ? 'compact' : 'comfortable'); b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
}

function onSaveDetectors() {
  // Each detector's action-preference <select> now lives inline in this same
  // tab (moved from the separate "פעולת ברירת מחדל" panel in General
  // settings - see settings.html), so one Save here persists both the
  // on/off toggle and the chosen action per type in a single step, instead
  // of needing a second visit to another tab to finish the job.
  window.tapactSettings.saveSettings({
    detectors: {
      phone: s.detectPhoneCheck.checked,
      tracking: s.detectTrackingCheck.checked,
      address: s.detectAddressCheck.checked,
      url: s.detectUrlCheck.checked,
      email: s.detectEmailCheck.checked,
      datetime: s.detectDatetimeCheck.checked
    },
    actionPreferences: {
      phone: s.prefPhoneSelect.value,
      address: s.prefAddressSelect.value,
      tracking: s.prefTrackingSelect.value,
      email: s.prefEmailSelect.value
    }
  });
  s.savedDetectorsMsg.classList.remove('hidden');
  setTimeout(() => s.savedDetectorsMsg.classList.add('hidden'), 1800);
}

function onSaveClipHistorySettings() {
  window.tapactSettings.saveSettings({
    historyEnabled: s.clipHistoryEnabledCheck.checked,
    historyStorageLimit: Math.max(50, Math.min(5000, Number(s.clipHistoryStorageInput.value) || 1000)),
    historyPreviewLimit: Math.max(10, Math.min(200, Number(s.clipHistoryPreviewInput.value) || 50))
  });
  s.savedClipHistoryMsg.classList.remove('hidden');
  setTimeout(() => s.savedClipHistoryMsg.classList.add('hidden'), 1800);
}

function onClearClipHistory() {
  window.tapactSettings.clearClipboardHistory();
  s.savedClipHistoryMsg.textContent = clipT('clip.cleared');
  s.savedClipHistoryMsg.classList.remove('hidden');
  setTimeout(() => {
    s.savedClipHistoryMsg.classList.add('hidden');
    s.savedClipHistoryMsg.textContent = clipT('settings.saved');
  }, 1800);
}

function onSaveActionPrefs() {
  window.tapactSettings.saveSettings({
    actionPreferences: {
      phone: s.prefPhoneSelect.value,
      address: s.prefAddressSelect.value,
      tracking: s.prefTrackingSelect.value,
      email: s.prefEmailSelect.value
    },
    autoRunAction: s.autoRunCheck.checked,
    autoRunDelaySeconds: Math.max(1, Math.min(30, Number(s.autoRunDelayInput.value) || 4))
  });
  s.savedActionPrefsMsg.classList.remove('hidden');
  setTimeout(() => s.savedActionPrefsMsg.classList.add('hidden'), 1800);
}

async function renderHistory() {
  const history = await window.tapactSettings.getHistory();
  s.historyList.replaceChildren();
  s.historyEmpty.classList.toggle('hidden', history.length > 0);
  for (const entry of history) {
    const row = document.createElement('div');
    row.className = 'history-row';

    const who = document.createElement('div');
    who.className = 'who';
    const phone = document.createElement('span');
    phone.className = 'phone';
    phone.textContent = entry.display || entry.normalized || '';
    who.appendChild(phone);
    if (entry.name) {
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = entry.name;
      who.appendChild(name);
    }

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${entry.templateLabel || ''} · ${timeAgoLabel(entry.sentAt)}`;

    row.appendChild(who);
    row.appendChild(meta);
    s.historyList.appendChild(row);
  }
}

async function onClearHistory() {
  window.tapactSettings.clearHistory();
  await renderHistory();
}

async function onExportCsv() {
  const result = await window.tapactSettings.exportHistoryCsv();
  if (result.canceled) return;
  s.exportMsg.textContent = clipT('export.success').replace('{path}', result.filePath);
  s.exportMsg.classList.remove('hidden');
  setTimeout(() => s.exportMsg.classList.add('hidden'), 4000);
}

function flashMsg(el) {
  if (!el) return;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1800);
}

function flashSaved() { flashMsg(s.savedMsg); }

// ─── Lead settings ────────────────────────────────────────────────────────────

function applyLeadSettings(ls) {
  s.leadChWhatsapp.checked = !!ls.channelWhatsapp;
  s.leadWhatsappNumber.value = ls.whatsappNumber || '';
  s.leadWhatsappRow.classList.toggle('hidden', !ls.channelWhatsapp);

  s.leadChWebhook.checked = !!ls.channelWebhook;
  s.leadWebhookUrl.value = ls.webhookUrl || '';
  s.leadWebhookHeaderName.value = ls.webhookHeaderName || '';
  s.leadWebhookHeaderValue.value = ls.webhookHeaderValue || '';
  s.leadWebhookRows.classList.toggle('hidden', !ls.channelWebhook);

  s.leadChSlack.checked = !!ls.channelSlack;
  s.leadSlackWebhookUrl.value = ls.slackWebhookUrl || '';
  s.leadSlackRow.classList.toggle('hidden', !ls.channelSlack);

  s.leadChEmail.checked = !!ls.channelEmail;
  s.leadEmailAddress.value = ls.emailAddress || '';
  s.leadEmailRow.classList.toggle('hidden', !ls.channelEmail);

  s.leadChCopy.checked = !!ls.channelCopy;
  s.leadMessageTemplate.value = ls.messageTemplate || '';
  s.leadAiEnabled.checked = !!ls.aiEnabled;
  s.leadAiApiKey.value = ls.aiApiKey || '';
  s.leadAiKeyRow.classList.toggle('hidden', !ls.aiEnabled);
  s.leadDupWindow.value = ls.duplicateWindowHours || 6;
  s.leadCustomSources.value = (ls.customSources || []).join(', ');
}

function onSaveLeadSettings() {
  const settings = {
    channelWhatsapp: s.leadChWhatsapp.checked,
    whatsappNumber: s.leadWhatsappNumber.value.trim(),
    channelWebhook: s.leadChWebhook.checked,
    webhookUrl: s.leadWebhookUrl.value.trim(),
    webhookHeaderName: s.leadWebhookHeaderName.value.trim(),
    webhookHeaderValue: s.leadWebhookHeaderValue.value.trim(),
    channelSlack: s.leadChSlack.checked,
    slackWebhookUrl: s.leadSlackWebhookUrl.value.trim(),
    channelEmail: s.leadChEmail.checked,
    emailAddress: s.leadEmailAddress.value.trim(),
    channelCopy: s.leadChCopy.checked,
    messageTemplate: s.leadMessageTemplate.value,
    aiEnabled: s.leadAiEnabled.checked,
    aiApiKey: s.leadAiApiKey.value.trim(),
    duplicateWindowHours: parseInt(s.leadDupWindow.value, 10) || 6,
    customSources: s.leadCustomSources.value.split(',').map((x) => x.trim()).filter(Boolean)
  };
  window.tapactSettings.saveLeadSettings(settings);
  s.savedLeadMsg.classList.remove('hidden');
  setTimeout(() => s.savedLeadMsg.classList.add('hidden'), 1800);
}

async function onClearLeadHistory() {
  window.tapactSettings.clearLeadHistory();
  await renderLeadHistory();
}

// Settings ▸ About ▸ "ייצוא קובץ אבחון" - triggers main.js's
// 'settings:export-diagnostics' handler (dialog.showSaveDialog + zip write),
// then shows the saved path (success) or a generic error (failure/thrown).
async function onExportDiagnostics() {
  if (!s.exportDiagnosticsBtn) return;
  s.exportDiagnosticsBtn.disabled = true;
  try {
    const result = await window.tapactSettings.exportDiagnostics();
    if (result && result.canceled) return;
    if (result && result.error) {
      showDiagMsg(clipT('diag.error'), true);
      return;
    }
    showDiagMsg(clipT('diag.success').replace('{path}', result.filePath), false);
  } catch (e) {
    showDiagMsg(clipT('diag.error'), true);
  } finally {
    s.exportDiagnosticsBtn.disabled = false;
  }
}

function showDiagMsg(text, isError) {
  if (!s.diagMsg) return;
  s.diagMsg.textContent = text;
  s.diagMsg.className = 'saved-msg' + (isError ? ' error' : '');
  s.diagMsg.classList.remove('hidden');
  setTimeout(() => s.diagMsg.classList.add('hidden'), 4000);
}

async function onExportLeadCsv() {
  s.exportLeadCsvBtn.disabled = true;
  try {
    const result = await window.tapactSettings.exportLeadHistoryCsv();
    if (!result.canceled) {
      s.exportLeadMsg.textContent = clipT('export.saved');
      s.exportLeadMsg.className = 'saved-msg';
      s.exportLeadMsg.classList.remove('hidden');
      setTimeout(() => s.exportLeadMsg.classList.add('hidden'), 2500);
    }
  } catch (e) {
    s.exportLeadMsg.textContent = clipT('leads.export.error');
    s.exportLeadMsg.className = 'saved-msg error';
    s.exportLeadMsg.classList.remove('hidden');
    setTimeout(() => s.exportLeadMsg.classList.add('hidden'), 2500);
  } finally {
    s.exportLeadCsvBtn.disabled = false;
  }
}

async function onTestChannel(channel) {
  const btn = channel === 'webhook' ? s.testWebhookBtn : s.testSlackBtn;
  const msgEl = channel === 'webhook' ? s.testWebhookMsg : s.testSlackMsg;
  btn.disabled = true;
  btn.textContent = clipT('leads.test.checking');
  try {
    const url = channel === 'webhook' ? s.leadWebhookUrl.value.trim() : s.leadSlackWebhookUrl.value.trim();
    if (!url) { showTestResult(btn, msgEl, false, clipT('leads.test.urlRequired')); return; }
    const result = await window.tapactSettings.testLeadChannel({ channel, url,
      headerName: channel === 'webhook' ? s.leadWebhookHeaderName.value.trim() : '',
      headerValue: channel === 'webhook' ? s.leadWebhookHeaderValue.value.trim() : '' });
    showTestResult(btn, msgEl, result.ok, result.ok ? clipT('leads.test.ok') : (result.error || clipT('leads.test.error')));
  } catch (e) {
    showTestResult(btn, msgEl, false, clipT('leads.test.error'));
  }
}

function showTestResult(btn, msgEl, ok, text) {
  btn.disabled = false;
  btn.textContent = clipT('leads.test.connection');
  msgEl.textContent = text;
  msgEl.className = 'saved-msg ' + (ok ? '' : 'error');
  msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 3000);
}

async function renderLeadHistory() {
  const history = await window.tapactSettings.getLeadHistory();
  s.leadHistoryList.replaceChildren();
  if (!history || !history.length) {
    s.leadHistoryEmpty.classList.remove('hidden');
    return;
  }
  s.leadHistoryEmpty.classList.add('hidden');
  for (const item of history) {
    const row = document.createElement('div');
    row.className = 'history-row';
    const d = new Date(item.sentAt);
    const fields = [item.phone, item.name, item.role, item.source, item.channel || '', d.toLocaleString(document.documentElement.lang === 'he' ? 'he-IL' : 'en-US')];
    const classes = ['history-phone', 'history-name', 'history-role', 'history-source', 'history-channel', 'history-date'];
    fields.forEach((text, i) => {
      const span = document.createElement('span');
      span.className = classes[i];
      span.textContent = text || '';
      row.appendChild(span);
    });
    s.leadHistoryList.appendChild(row);
  }
}
