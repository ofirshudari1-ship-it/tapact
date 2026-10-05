const CATEGORY_ICON = {
  phone: '📞',
  tracking: '📦',
  address: '🗺️',
  url: '🔗',
  email: '✉️',
  custom: '⚡',
  text: '📋'
};

let items = [];
let total = 0;
let pageSize = 50;
let historyEnabled = true;
let activeCategory = 'all';
let searchTerm = '';
let lang = 'en';
// Multi-select "paste stack" (see main.js's history-panel:copy-merged) -
// selectMode toggles the checkboxes on; selectedIds is a plain array (not a
// Set) so it preserves the ORDER the user ticked items in, since that order
// is exactly what copy-merged uses to build the combined paste.
let selectMode = false;
let selectedIds = [];

const els = {};

// True when this page is loaded as the BrowserView embedded inside Settings
// ▸ היסטוריית לוח (see main.js's getHistoryEmbedView) rather than as the
// standalone quick-access popup (openHistoryWindow). The two share this
// exact same HTML/JS/preload - only the chrome differs: the embedded view
// lives inside a window that already has its own title bar and tab nav, so
// its own "✕" close button (which only makes sense for the frameless
// standalone popup) would otherwise sit there doing nothing.
const isEmbedded = new URLSearchParams(location.search).get('embedded') === '1';

document.addEventListener('DOMContentLoaded', async () => {
  els.list = document.getElementById('list');
  els.emptyState = document.getElementById('emptyState');
  els.emptyStateText = document.getElementById('emptyStateText');
  els.searchInput = document.getElementById('searchInput');
  els.filters = document.getElementById('filters');
  els.closeBtn = document.getElementById('closeBtn');
  els.clearBtn = document.getElementById('clearBtn');
  els.toggleBtn = document.getElementById('toggleBtn');
  els.pauseDot = document.getElementById('pauseDot');
  els.statusText = document.getElementById('statusText');
  els.countLabel = document.getElementById('countLabel');
  els.selectModeBtn = document.getElementById('selectModeBtn');
  els.selectBar = document.getElementById('selectBar');
  els.selectCountLabel = document.getElementById('selectCountLabel');
  els.copySelectedBtn = document.getElementById('copySelectedBtn');
  els.cancelSelectBtn = document.getElementById('cancelSelectBtn');
  els.exportBtn = document.getElementById('exportBtn');
  els.importBtn = document.getElementById('importBtn');

  document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.classList.contains('active'))));

  if (isEmbedded) {
    document.body.classList.add('embedded');
    els.closeBtn.style.display = 'none';
  }

  await load();
  render();

  els.searchInput.focus();
  els.searchInput.addEventListener('input', () => {
    searchTerm = els.searchInput.value.trim().toLowerCase();
    render();
  });

  els.filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    activeCategory = btn.dataset.cat;
    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('active', c === btn);
      c.setAttribute('aria-pressed', String(c === btn)); // selected filter, for screen readers
    });
    render();
  });

  els.closeBtn.addEventListener('click', () => window.tapactHistory.dismiss());
  els.clearBtn.addEventListener('click', () => {
    window.tapactHistory.clearAll();
    items = [];
    total = 0;
    render();
  });

  els.toggleBtn.addEventListener('click', () => {
    historyEnabled = !historyEnabled;
    window.tapactHistory.toggleEnabled(historyEnabled);
    updateStatus();
  });

  els.selectModeBtn.addEventListener('click', () => setSelectMode(!selectMode));
  els.cancelSelectBtn.addEventListener('click', () => setSelectMode(false));
  els.copySelectedBtn.addEventListener('click', () => {
    if (!selectedIds.length) return;
    window.tapactHistory.copyMerged(selectedIds);
    setSelectMode(false);
  });

  els.exportBtn.addEventListener('click', async () => {
    await window.tapactHistory.exportHistory();
  });
  els.importBtn.addEventListener('click', async () => {
    const result = await window.tapactHistory.importHistory();
    if (result && !result.canceled) {
      await load();
      render();
    }
  });

  window.tapactHistory.onItemsChanged(async () => {
    await load();
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !isEmbedded) window.tapactHistory.dismiss();
  });
});

async function load(limit) {
  const data = await window.tapactHistory.getData(limit);
  items = data.items || [];
  total = data.total || items.length;
  pageSize = limit || items.length || 50;
  historyEnabled = data.historyEnabled !== false;

  // Follow the UI language, same as every other window (§4).
  if (typeof window.i18n !== 'undefined') {
    lang = (data.settings && data.settings.language) || 'en';
    window.i18n.applyI18n(lang);
  }

  updateStatus();
}

function setSelectMode(on) {
  selectMode = on;
  if (!on) selectedIds = [];
  els.selectModeBtn.classList.toggle('active', on);
  updateSelectBar();
  render();
}

function toggleSelected(id) {
  const idx = selectedIds.indexOf(id);
  if (idx === -1) selectedIds.push(id); // append - preserves the order the user ticked items in
  else selectedIds.splice(idx, 1);
  updateSelectBar();
  render();
}

function updateSelectBar() {
  const t = (key) => window.i18n ? window.i18n.t(lang, key) : key;
  els.selectBar.classList.toggle('hidden', !selectMode);
  els.copySelectedBtn.disabled = selectedIds.length === 0;
  els.selectCountLabel.textContent = t('clip.panel.selectedCount').replace('{n}', selectedIds.length);
}

function updateStatus() {
  const t = (key) => window.i18n ? window.i18n.t(lang, key) : key;
  els.pauseDot.classList.toggle('paused', !historyEnabled);
  els.statusText.textContent = historyEnabled ? t('clip.panel.recording') : t('clip.panel.paused');
  els.toggleBtn.textContent = historyEnabled ? t('clip.pause') : t('clip.resume');
}

function timeAgoLabel(timestamp) {
  const t = (key) => window.i18n ? window.i18n.t(lang, key) : key;
  const mins = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (mins < 1) return t('clip.time.now');
  if (mins < 60) return t('clip.time.min').replace('{n}', mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('clip.time.hour').replace('{n}', hours);
  return t('clip.time.day').replace('{n}', Math.round(hours / 24));
}

function fullDateLabel(timestamp) {
  return new Date(timestamp).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function matchesSearch(item, term) {
  if (!term) return true;
  if (item.text.toLowerCase().includes(term)) return true;
  return (item.tags || []).some((t) => t.toLowerCase().includes(term));
}

function render() {
  const t = (key) => window.i18n ? window.i18n.t(lang, key) : key;
  const filtered = items.filter((item) => {
    if (activeCategory === 'pinned') { if (!item.pinned) return false; }
    else if (activeCategory !== 'all' && item.category !== activeCategory) return false;
    if (!matchesSearch(item, searchTerm)) return false;
    return true;
  });

  els.list.replaceChildren();
  els.emptyState.classList.toggle('hidden', filtered.length > 0);
  if (filtered.length === 0) {
    const isFiltered = Boolean(searchTerm) || activeCategory !== 'all';
    els.emptyStateText.textContent = isFiltered
      ? t('clip.panel.emptyFiltered')
      : t('clip.panel.empty');
  }
  els.countLabel.textContent = total > items.length
    ? t('clip.panel.countShowing').replace('{shown}', items.length).replace('{total}', total)
    : t('clip.panel.countTotal').replace('{n}', total);

  for (const item of filtered) {
    els.list.appendChild(buildRow(item));
  }

  if (items.length < total && !searchTerm && activeCategory === 'all') {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more';
    loadMoreBtn.textContent = t('clip.panel.loadMore').replace('{n}', total - items.length);
    loadMoreBtn.addEventListener('click', async () => {
      await load(pageSize + 50);
      render();
    });
    els.list.appendChild(loadMoreBtn);
  }
}

function buildRow(item) {
  const t = (key) => window.i18n ? window.i18n.t(lang, key) : key;
  const row = document.createElement('div');
  row.className = 'item';
  if (item.pinned) row.classList.add('pinned');
  // The row is a plain container. Its text area (below) is the real <button>
  // that copies the item; pin/delete/quick-action are sibling buttons, so no
  // interactive element sits inside another (axe nested-interactive). A click
  // anywhere else on the row still copies, via the row's click listener.

  if (selectMode) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'select-checkbox';
    checkbox.checked = selectedIds.includes(item.id);
    checkbox.setAttribute('aria-label', t('clip.panel.selectItem'));
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => toggleSelected(item.id));
    row.appendChild(checkbox);
  }

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = CATEGORY_ICON[item.category] || '📋';

  const content = document.createElement('button');
  content.type = 'button';
  content.className = 'content';
  content.setAttribute('aria-label', item.text);
  const text = document.createElement('span');
  text.className = 'text';
  if (item.pinned) {
    // Always-visible pin badge (unlike the .item-actions pin/delete buttons,
    // which only show on hover/focus) - so a pinned item is recognizable at
    // a glance even without hovering it.
    const pinBadge = document.createElement('span');
    pinBadge.className = 'pin-badge';
    pinBadge.textContent = '📌';
    text.appendChild(pinBadge);
  }
  text.appendChild(document.createTextNode(item.text));
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.title = fullDateLabel(item.copiedAt);
  meta.textContent = `${timeAgoLabel(item.copiedAt)} · ${fullDateLabel(item.copiedAt)}`;
  content.appendChild(text);
  content.appendChild(meta);

  if (item.tags && item.tags.length) {
    const tagsRow = document.createElement('span');
    tagsRow.className = 'tags-row';
    for (const tag of item.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag;
      tagsRow.appendChild(chip);
    }
    content.appendChild(tagsRow);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  if (item.actions && item.actions.length) {
    const goBtn = document.createElement('button');
    goBtn.className = 'go';
    goBtn.title = item.actions[0].label;
    goBtn.setAttribute('aria-label', item.actions[0].label);
    goBtn.textContent = '▶';
    goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.tapactHistory.runAction(item.id, 0);
    });
    actions.appendChild(goBtn);
  }

  const pinBtn = document.createElement('button');
  pinBtn.className = 'pin' + (item.pinned ? ' active' : '');
  const pinLabel = t(item.pinned ? 'clip.panel.unpin' : 'clip.panel.pin');
  pinBtn.title = pinLabel;
  pinBtn.setAttribute('aria-label', pinLabel);
  pinBtn.setAttribute('aria-pressed', String(Boolean(item.pinned)));
  pinBtn.textContent = '📌';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tapactHistory.togglePin(item.id);
  });
  actions.appendChild(pinBtn);

  const delBtn = document.createElement('button');
  const deleteLabel = t('clip.panel.delete');
  delBtn.title = deleteLabel;
  delBtn.setAttribute('aria-label', deleteLabel);
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.tapactHistory.deleteItem(item.id);
    items = items.filter((i) => i.id !== item.id);
    total = Math.max(0, total - 1);
    render();
  });
  actions.appendChild(delBtn);

  row.appendChild(icon);
  row.appendChild(content);
  row.appendChild(actions);

  const activate = () => {
    if (selectMode) toggleSelected(item.id);
    else window.tapactHistory.copyItem(item.id);
  };
  // One listener on the row: the content <button> (mouse or Enter/Space)
  // bubbles here; the action buttons and checkbox stop propagation.
  row.addEventListener('click', activate);

  return row;
}
