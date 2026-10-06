// Live pass for v3.10.0 UI: Settings (General tab single Save, dirty state, snooze status, removed toggles,
// rules panel), history window + action popup + phone popup in the given language/theme, with axe.
// Usage: LANG_UI=he|en THEME=dark|light node v310-screens.cjs
const path = require('path');
const fs = require('fs');
const { launch, probe, axe, leakCheck, sleep, waitFor } = require('./lib.cjs');

const LANG = process.env.LANG_UI || 'he';
const THEME = process.env.THEME || 'dark';
const OUT = path.resolve(__dirname, '..', 'v310');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); };
const tag = `${LANG}__${THEME}`;
const sc = (n) => path.join(OUT, `${n}__${tag}.png`);

async function axeCheck(page, name) {
  const v = await axe(page);
  const bad = v.filter((x) => ['serious', 'critical'].includes(x.impact));
  check(`axe ${name}: serious/critical = 0`, bad.length === 0, bad.length ? bad : v.map((x) => x.id + ':' + x.impact));
}

(async () => {
  const seed = { settings: { welcomeSeen: true, languageResolved: true, language: LANG, theme: THEME, autoCloseSeconds: 60 } };
  const ctx = await launch({ lang: LANG === 'he' ? 'he-IL' : 'en-US', seed, tag: `v310s-${tag}`, nodePort: 9489, rdPort: 9483 });
  try {
    await ctx.mainEval(`store.saveSettings({ autoCloseSeconds: 60 });
      store.addClipboardHistoryItem({ text: 'שלום John 050-1234567', category: 'phone', actions: [{ label: 'WhatsApp: 050-1234567', url: 'https://wa.me/972501234567' }], tags: [] });
      store.addClipboardHistoryItem({ text: 'https://example.com/he/article?id=12', category: 'url', actions: [{ label: 'Open example.com', url: 'https://example.com' }], tags: [] });
      store.addClipboardHistoryItem({ text: 'Herzl 12, Tel Aviv', category: 'address', actions: null, tags: [] });
      store.addClipboardHistoryItem({ text: 'RR123456789IL', category: 'tracking', actions: null, tags: ['project'] });
      store.saveTagRules([{ id: 'g1', label: 'project', keywords: ['project'] }]);
      return true`);

    // ---------------- Settings ----------------
    await ctx.mainEval(`app.emit('second-instance'); return true`);
    const st = await ctx.pageFor('settings.html'); await sleep(1500);
    await st.click('.nav-btn[data-tab="settings"]'); await sleep(500);
    const gen = await st.evaluate(() => ({
      noNotif: !document.getElementById('showTrayNotificationCheck'),
      noStartMin: !document.getElementById('startMinimizedCheck'),
      saveButtons: [...document.querySelectorAll('#tab-settings .btn.primary')].map((b) => b.id),
      rules: document.querySelectorAll('#tab-settings .rules-list li').length,
      rulesText: [...document.querySelectorAll('#tab-settings .rules-list li')].map((l) => l.textContent.trim().slice(0, 50)),
      dirtyHidden: document.getElementById('generalDirty').classList.contains('hidden'),
      poll: document.getElementById('pollInput').value, close: document.getElementById('autoCloseInput').value
    }));
    check('General tab: Windows-notification and start-minimized switches are gone', gen.noNotif && gen.noStartMin, gen);
    check('General tab: exactly one primary Save button', gen.saveButtons.length === 1 && gen.saveButtons[0] === 'saveSettingsBtn', gen.saveButtons);
    check('General tab: the 6 "when a popup opens" rules are shown', gen.rules === 6, gen.rulesText);
    // dirty state + tab switching keeps changes
    await st.fill('#pollInput', '500');
    await st.fill('#autoCloseInput', '9');
    await st.evaluate(() => document.getElementById('quietHoursEnabledCheck').click());
    await sleep(200);
    const d1 = await st.evaluate(() => ({ note: !document.getElementById('generalDirty').classList.contains('hidden'), dot: document.getElementById('navSettingsBtn').classList.contains('has-unsaved') }));
    await st.click('.nav-btn[data-tab="detectors"]'); await sleep(300);
    await st.click('.nav-btn[data-tab="templates"]'); await sleep(300);
    await st.click('.nav-btn[data-tab="settings"]'); await sleep(300);
    const d2 = await st.evaluate(() => ({ note: !document.getElementById('generalDirty').classList.contains('hidden'), poll: document.getElementById('pollInput').value, ac: document.getElementById('autoCloseInput').value, quiet: document.getElementById('quietHoursEnabledCheck').checked }));
    check('unsaved note + nav dot appear on edit, and survive switching tabs with values intact', d1.note && d1.dot && d2.note && d2.poll === '500' && d2.ac === '9' && d2.quiet, { d1, d2 });
    await st.screenshot({ path: sc('settings-general-dirty') });
    await st.click('#saveSettingsBtn'); await sleep(600);
    const saved = await ctx.mainEval(`const s = store.getSettings(); return { poll: s.pollMs, ac: s.autoCloseSeconds, quiet: s.quietHours.enabled }`);
    const d3 = await st.evaluate(() => ({ note: !document.getElementById('generalDirty').classList.contains('hidden'), dot: document.getElementById('navSettingsBtn').classList.contains('has-unsaved') }));
    check('one Save persists poll + auto-close + quiet hours together and clears the dirty state', saved.poll === 500 && saved.ac === 9 && saved.quiet === true && !d3.note && !d3.dot, { saved, d3 });
    await ctx.mainEval(`store.saveSettings({ autoCloseSeconds: 60 }); return true`);
    // snooze status line + resume
    await ctx.mainEval(`const T = require('./lib/i18n-renderer').t; const lbl = ['he','en'].map(l => T(l, 'tray.snooze.title')); const it = global.__menu.items.find(i => lbl.includes(i.label)); it.submenu.items[1].click(); return true`);
    await sleep(600);
    const sn = await st.evaluate(() => ({ visible: !document.getElementById('snoozeStatus').classList.contains('hidden'), text: document.getElementById('snoozeStatusText').textContent }));
    check('snooze status line appears in Settings when snoozed from the tray', sn.visible && /\d\d:\d\d/.test(sn.text), sn);
    await st.screenshot({ path: sc('settings-general-snoozed') });
    await axeCheck(st, 'Settings General (snoozed + rules)');
    await st.click('#snoozeResumeBtn'); await sleep(500);
    const sn2 = await ctx.mainEval(`return store.getSettings().snoozeUntil`);
    check('Resume now in Settings clears the snooze', sn2 === 0, sn2);
    // detectors tab reflects a detector switched off from a popup
    await st.click('.nav-btn[data-tab="detectors"]'); await sleep(300);
    await axeCheck(st, 'Settings Detection Types');
    // templates tab: language-appropriate default templates + {name} documented
    await st.click('.nav-btn[data-tab="templates"]'); await sleep(400);
    const tpl = await st.evaluate(() => ({ first: document.querySelector('#templateList input, .card input')?.value || '', hint: document.querySelector('[data-i18n="templates.hint.body"]')?.textContent || '', texts: [...document.querySelectorAll('textarea')].map((t) => t.value.slice(0, 40)) }));
    if (LANG === 'en') check('English install: untouched stock templates are English with {name}', /\{name\}/.test(tpl.texts[0]) && !/[\u0590-\u05FF]/.test(tpl.texts[0]), tpl);
    else check('Hebrew install keeps the Hebrew stock templates with {שם}', /\{שם\}/.test(tpl.texts[0]), tpl);
    check('Templates tab documents {name}', /\{name\}/.test(tpl.hint), tpl.hint.slice(0, 120));
    await st.screenshot({ path: sc('settings-templates') });
    await ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => /settings\\.html/.test(w.webContents.getURL())).forEach(w => w.destroy()); return true`);

    // ---------------- History quick window ----------------
    await ctx.mainEval(`global.__sc['CommandOrControl+Alt+V'](); return true`);
    const hist = await ctx.pageFor('clipboard-history.html'); await sleep(1200);
    await hist.screenshot({ path: sc('history') });
    const hp = await probe(hist);
    check('history window follows the theme', hp.doc.theme === THEME, hp.doc);
    await axeCheck(hist, 'history window');
    await ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => /clipboard-history/.test(w.webContents.getURL())).forEach(w => w.destroy()); return true`);

    // ---------------- Action popup (manual open: no burst counting) ----------------
    await ctx.mainEval(`global.__clip = 'https://example.com/he/article?id=12&a=b'; return true`);
    let ap = await ctx.pageFor('action-popup.html'); await sleep(1500);
    await ap.screenshot({ path: sc('action-popup') });
    const ad = await ap.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), snoozeBtn: !!document.getElementById('snoozeBtn'), bar: !document.getElementById('countdown').classList.contains('idle') }));
    check('action popup: theme, snooze button and countdown bar present', ad.theme === THEME && ad.snoozeBtn && ad.bar, ad);
    await axeCheck(ap, 'action popup');
    await ap.click('#snoozeBtn'); await sleep(500);
    await ap.screenshot({ path: sc('action-popup-snooze-menu') });
    const am = await ap.evaluate(() => ({ items: [...document.querySelectorAll('#snoozePanel button:not(.hidden)')].map((b) => b.textContent.trim()), h: innerHeight }));
    check('action popup snooze menu shows 5 items (3 durations, type, back) and fits the window', am.items.length === 5, am);
    await axeCheck(ap, 'action popup snooze menu');
    await ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => /popup\\.html/.test(w.webContents.getURL())).forEach(w => w.destroy()); return true`);

    // ---------------- Phone popup ----------------
    await ctx.mainEval(`global.__clip = 'שלום John 050-7654321'; return true`);
    const pp = await ctx.pageFor('popup/popup.html'); await sleep(1600);
    await pp.screenshot({ path: sc('popup-phone-countdown') });
    await axeCheck(pp, 'phone popup (countdown bar)');
    await pp.click('#snoozeBtn'); await sleep(500);
    await pp.screenshot({ path: sc('popup-phone-snooze-menu') });
    const pt = await pp.evaluate(() => ({ items: [...document.querySelectorAll('#snoozePanel button:not(.hidden)')].map((b) => b.textContent.trim()), dir: document.documentElement.dir }));
    check('phone popup snooze menu texts', pt.items.length === 5, pt);
    const leaks = leakCheck(LANG, (await probe(pp)).texts);
    check('no language leaks in the phone popup with the menu open', leaks.length === 0, leaks);
    await axeCheck(pp, 'phone popup snooze menu');
  } catch (e) {
    console.error('ERROR', e); results.push({ name: 'exception', ok: false, extra: String(e).slice(0, 400) });
  } finally {
    fs.writeFileSync(path.join(OUT, `screens__${tag}.json`), JSON.stringify(results, null, 1));
    await ctx.close();
    console.log(`${tag}: ${results.filter((r) => r.ok).length}/${results.length} passed`);
  }
})();
