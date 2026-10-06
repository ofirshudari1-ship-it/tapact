// Live: Settings > "Where WhatsApp opens" really changes the link; default is WhatsApp Web; history quick action resolves at click time.
const { launch, sleep, waitFor } = require('./lib.cjs');
const popups = (ctx) => ctx.mainEval(`return BrowserWindow.getAllWindows().filter(w => /popup\.html$/.test(w.webContents.getURL().split('?')[0])).length`);
const ok = (n, v, x) => console.log((v ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
(async () => {
  const ctx = await launch({ lang: 'he-IL', seed: { settings: { welcomeSeen: true, languageResolved: true, language: 'he', theme: 'dark' } }, tag: 'v3103', nodePort: 9479, rdPort: 9473 });
  try {
    await sleep(1000);
    const ext = async () => JSON.parse(await ctx.mainEval(`return JSON.stringify(global.__ext)`));
    const clickWa = async (num) => {
      await ctx.mainEval(`global.__ext.length = 0; global.__clip = '${num}'; return true`);
      await waitFor(async () => (await popups(ctx)) === 1, 6000, 100);
      const pg = await ctx.pageFor('popup/popup.html'); await sleep(1200);
      await pg.click('#btnWhatsapp'); await sleep(900);
      await waitFor(async () => (await popups(ctx)) === 0, 4000, 100).catch(() => {});
      return (await ext())[0] || '';
    };
    // 1) default
    const d = await clickWa('052-1110001');
    ok('default opens WhatsApp Web directly', /^https:\/\/web\.whatsapp\.com\/send\?phone=972521110001&text=/.test(d), d.slice(0, 70));
    await sleep(11000);
    // 2) set via the real settings IPC path (sanitized), then wa.me
    await ctx.mainEval(`require('./lib/store').saveSettings({ whatsappTarget: 'wame' }); return true`);
    const w = await clickWa('052-1110002');
    ok('wa.me target opens wa.me', /^https:\/\/wa\.me\/972521110002\?text=/.test(w), w.slice(0, 60));
    await sleep(11000);
    // 3) desktop: app protocol if a handler exists, otherwise falls back to Web
    await ctx.mainEval(`require('./lib/store').saveSettings({ whatsappTarget: 'desktop' }); return true`);
    const hasApp = await ctx.mainEval(`return !!require('electron').app.getApplicationNameForProtocol('whatsapp://')`);
    const k = await clickWa('052-1110003');
    ok('desktop target: ' + (hasApp ? 'whatsapp:// (app registered here)' : 'falls back to Web (no app registered)'),
       hasApp ? /^whatsapp:\/\/send\?phone=972521110003/.test(k) : /^https:\/\/web\.whatsapp\.com\/send\?phone=972521110003/.test(k), k.slice(0, 60));
    // 4) history quick action resolves at click time (stored item has phone, target switched to wame now)
    await ctx.mainEval(`require('./lib/store').saveSettings({ whatsappTarget: 'wame' }); global.__ext.length = 0; return true`);
    const item = await ctx.mainEval(`const s = require('./lib/store'); const it = s.getClipboardHistory().find(i => i.actions && i.actions[0] && i.actions[0].wa); return JSON.stringify(it ? { id: it.id, wa: it.actions[0].wa } : null)`);
    ok('history item stores the phone for click-time resolution', !!item, item);
    // 5) Settings UI (real window): select present, Hebrew labels, default shown, saving through the guard works
    await ctx.mainEval(`require('./lib/store').saveSettings({ whatsappTarget: 'web' }); app.emit('second-instance'); return true`);
    const st = await ctx.pageFor('settings.html'); await sleep(1500);
    await st.click('.nav-btn[data-tab="settings"]'); await sleep(500);
    const ui = await st.evaluate(() => {
      const sel = document.getElementById('whatsappTargetSelect');
      const lab = document.querySelector('label[for="whatsappTargetSelect"]');
      return { exists: !!sel, value: sel && sel.value, options: sel && [...sel.options].map((o) => o.textContent), label: lab && lab.textContent, dir: getComputedStyle(document.documentElement).direction,
               hint: lab && lab.parentElement.querySelector('.field-hint').textContent, overflow: sel && sel.scrollWidth > sel.clientWidth + 2 };
    });
    ok('settings select exists, shows WhatsApp Web, Hebrew RTL labels', ui.exists && ui.value === 'web' && ui.dir === 'rtl' && /וואטסאפ/.test(ui.label), JSON.stringify(ui));
    await st.evaluate(() => { const sel = document.getElementById('whatsappTargetSelect'); sel.value = 'desktop'; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.dispatchEvent(new Event('input', { bubbles: true })); });
    const saveBtn = await st.evaluate(() => (document.querySelector('#tab-settings .btn.primary') || {}).id);
    await st.click('#' + saveBtn); await sleep(800);
    const saved = await ctx.mainEval(`return require('./lib/store').getSettings().whatsappTarget`);
    ok('choosing "desktop" in Settings and pressing Save persists it', saved === 'desktop', saved);
    await st.screenshot({ path: require('path').resolve(__dirname, '..', 'v310', 'settings-whatsapp-target__he.png') });
  } finally { await ctx.close(); }
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
