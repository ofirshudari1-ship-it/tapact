// EVAL round-1 fix verification: welcome (axe every step, last-step CTA
// visible without scroll), history (axe, keyboard paste, pin/delete still
// work), Settings footer language button tooltip. 4 configs.
// node r2-check.cjs  -> ../r2-check.json + ../screenshots/after-r2/*.png
const path = require('path');
const fs = require('fs');
const { launch, axe, sleep } = require('./lib.cjs');
const OUT = path.resolve(__dirname, '..');
const SHOTS = path.join(OUT, 'screenshots', 'after-r2');
fs.mkdirSync(SHOTS, { recursive: true });
const CONFIGS = [['he', 'dark', 'he-IL'], ['he', 'light', 'he-IL'], ['en', 'dark', 'en-US'], ['en', 'light', 'en-US']];
const res = [];
const serious = (a) => a.filter((v) => ['serious', 'critical'].includes(v.impact));

(async () => {
  for (const [lang, theme, loc] of CONFIGS) {
    const ctx = await launch({ lang: loc, seed: theme === 'light' ? { settings: { theme: 'light' } } : null, tag: `r2-${lang}-${theme}` });
    const row = { lang, theme, welcome: [], history: {}, settings: {} };
    try {
      const wel = await ctx.pageFor('welcome.html');
      const console_ = []; wel.on('console', (m) => { if (m.type() === 'error') console_.push(m.text()); });
      await sleep(1200);
      for (let i = 0; i < 5; i++) {
        const a = await axe(wel);
        const geo = await wel.evaluate(() => {
          const st = document.querySelector('.step.active');
          const btn = st.querySelector('#openSettingsBtn');
          const r = btn ? btn.getBoundingClientRect() : null;
          return { step: st.dataset.step, scrollH: st.scrollHeight, clientH: st.clientHeight, btnBottom: r && Math.round(r.bottom), stepBottom: Math.round(st.getBoundingClientRect().bottom) };
        });
        await wel.screenshot({ path: path.join(SHOTS, `welcome-step${i}__${lang}__${theme}.png`) });
        row.welcome.push({ ...geo, axeSerious: serious(a), axeAll: a.map((v) => `${v.id}:${v.impact}:${v.n}`) });
        if (i < 4) { await wel.click('#nextBtn'); await sleep(450); }
      }
      row.welcomeConsoleErrors = console_;
      await ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('welcome.html')).forEach(w => w.destroy()); return true;`);

      await ctx.mainEval(`store.saveSettings({ language: '${lang}', theme: '${theme}' });
        store.addClipboardHistoryItem({ text: 'https://example.com/a', category: 'url', actions: [{ label: 'open', url: 'https://example.com/a' }], tags: ['פרויקט'] });
        store.addClipboardHistoryItem({ text: 'שלום John 050-1234567 ₪1,234', category: 'phone', actions: [{ label: 'WhatsApp', url: 'https://wa.me/972501234567' }], tags: [] });
        global.__clipWritten.length = 0; return true;`);
      await ctx.mainEval(`global.__sc['CommandOrControl+Alt+V'](); return true;`);
      let hist = await ctx.pageFor('clipboard-history.html');
      await sleep(1200);
      row.history.axeSerious = serious(await axe(hist));
      row.history.nestedButtons = await hist.evaluate(() => [...document.querySelectorAll('button, [role=button], input')].filter((el) => el.parentElement && el.parentElement.closest('button, [role=button]')).length);
      // keyboard: focus the first item's paste button, press Enter
      await hist.evaluate(() => document.querySelector('.item .content').focus());
      await hist.screenshot({ path: path.join(SHOTS, 'history-focus__' + lang + '__' + theme + '.png') });
      try { await hist.keyboard.press('Enter'); } catch (_) { /* paste closes the panel */ }
      await sleep(600);
      row.history.pastedByEnter = await ctx.mainEval(`return global.__clipWritten.slice();`);
      row.history.panelClosedAfterPaste = await ctx.mainEval("return !BrowserWindow.getAllWindows().some(w => !w.isDestroyed() && w.webContents.getURL().includes('clipboard-history.html'));");
      if (row.history.panelClosedAfterPaste) { await ctx.mainEval("global.__sc['CommandOrControl+Alt+V'](); return true;"); }
      hist = await ctx.pageFor('clipboard-history.html'); await sleep(1000);
      // pin via its own button (should not also paste)
      await ctx.mainEval(`global.__clipWritten.length = 0; return true;`);
      await hist.evaluate(() => document.querySelector('.item .item-actions button.pin').click());
      await sleep(500);
      row.history.pinnedAfterClick = await ctx.mainEval(`return store.getClipboardHistory().filter(i => i.pinned).length;`);
      row.history.pasteDuringPin = await ctx.mainEval(`return global.__clipWritten.length;`);
      await ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes('clipboard-history.html')).forEach(w => w.destroy()); return true;`);

      await ctx.mainEval(`app.emit('second-instance'); return true;`);
      const st = await ctx.pageFor('settings.html');
      await sleep(1200);
      row.settings.footerLang = await st.evaluate(() => { const b = document.getElementById('footerLang'); return { title: b.title, aria: b.getAttribute('aria-label') }; });
      await st.click('.nav-btn[data-tab="settings"]'); await sleep(300);
      row.settings.autoRunSub = await st.evaluate(() => document.querySelector('[data-i18n="settings.autoRun.sub"]').textContent);
      row.settings.notificationsSub = await st.evaluate(() => document.querySelector('[data-i18n="settings.notifications.sub"]').textContent);
      row.settings.axeSerious = serious(await axe(st));
    } catch (e) { row.error = String(e).slice(0, 300); }
    finally { await ctx.close(); }
    res.push(row);
    const lw = row.welcome[4] || {};
    console.log(`${lang}/${theme} welcomeSerious=${row.welcome.reduce((n, w) => n + w.axeSerious.length, 0)} last: scroll ${lw.scrollH}/${lw.clientH} btnBottom ${lw.btnBottom}<=${lw.stepBottom} | history serious=${(row.history.axeSerious || []).length} nested=${row.history.nestedButtons} enterPaste=${JSON.stringify(row.history.pastedByEnter)} pinned=${row.history.pinnedAfterClick} pasteDuringPin=${row.history.pasteDuringPin} | footer=${JSON.stringify(row.settings.footerLang)} settingsSerious=${(row.settings.axeSerious || []).length} ${row.error || ''}`);
  }
  fs.writeFileSync(path.join(OUT, 'r2-check.json'), JSON.stringify(res, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
