// Full live pass over every TapAct window x language x theme.
// Usage: node pass.cjs <before|after> [--force]
// Writes ../screenshots/<label>/*.png and ../browser-<label>.json.
// Refuses to write into a non-empty screenshots dir without --force, so a
// re-run can never silently overwrite the baseline evidence.
const path = require('path');
const fs = require('fs');
const { launch, probe, axe, leakCheck, sleep, waitFor } = require('./lib.cjs');

const LABEL = process.argv[2];
if (!['before', 'after'].includes(LABEL)) { console.error('label must be before|after'); process.exit(2); }
const OUT = path.resolve(__dirname, '..');
const SHOTS = path.join(OUT, 'screenshots', LABEL);
fs.mkdirSync(SHOTS, { recursive: true });
if (fs.readdirSync(SHOTS).length && !process.argv.includes('--force')) { console.error(`${SHOTS} is not empty; pass --force to overwrite`); process.exit(3); }
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean); // e.g. ONLY=he-dark

const TABS = ['templates', 'detectors', 'custom-rules', 'settings', 'shortcuts', 'tags', 'leads', 'clipboard-history', 'history', 'about'];
const CONFIGS = [
  { lang: 'he', theme: 'dark', loc: 'he-IL' },
  { lang: 'he', theme: 'light', loc: 'he-IL' },
  { lang: 'en', theme: 'dark', loc: 'en-US' },
  { lang: 'en', theme: 'light', loc: 'en-US' }
].filter((c) => !ONLY.length || ONLY.includes(`${c.lang}-${c.theme}`));

const TEST = 'שלום John 050-1234567 ₪1,234';
const results = [];

async function record(page, name, cfg, { doAxe = true, shot = true } = {}) {
  const file = `${name}__${cfg.lang}__${cfg.theme}.png`;
  if (shot) await page.screenshot({ path: path.join(SHOTS, file) });
  if (shot && name.startsWith('settings-') && name.includes('1040x780')) {
    // Second, full-length capture: the panel scrolls inside main.content, so
    // temporarily let the shell grow to its content height for one shot.
    await page.evaluate(() => { const st = document.createElement('style'); st.id = '__fullshot'; st.textContent = 'html,body{height:auto!important;overflow:visible!important}.shell{height:auto!important;min-height:100vh}main.content{overflow:visible!important;height:auto!important}'; document.head.appendChild(st); });
    await page.screenshot({ path: path.join(SHOTS, file.replace('.png', '__full.png')), fullPage: true });
    await page.evaluate(() => document.getElementById('__fullshot').remove());
  }
  const p = await probe(page);
  const leaks = leakCheck(cfg.lang, p.texts);
  const ax = doAxe ? await axe(page) : null;
  const row = { window: name, lang: cfg.lang, theme: cfg.theme, file: shot ? file : null, doc: p.doc, leaks, fields: p.fields, overflow: p.overflow, axe: ax, console: page.__console ? [...page.__console] : [] };
  results.push(row);
  console.log(`${name} ${cfg.lang}/${cfg.theme}: lang=${p.doc.lang} dir=${p.doc.dir} theme=${p.doc.theme} leaks=${leaks.length} axe=${ax ? ax.reduce((a, v) => a + v.n, 0) : '-'} console=${row.console.length}`);
  return row;
}

function watchConsole(page) {
  if (page.__console) return;
  page.__console = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.__console.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => page.__console.push(`pageerror: ${String(e).slice(0, 200)}`));
}

async function closeWindows(ctx, frag) {
  await ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().includes(${JSON.stringify(frag)})).forEach(w => w.destroy()); return true;`);
  await sleep(300);
}

async function runConfig(cfg) {
  // ---- Phase A: genuine first run (no seed except theme), OS locale via --lang
  const seed = cfg.theme === 'light' ? { settings: { theme: 'light' } } : null;
  const ctx = await launch({ lang: cfg.loc, seed, tag: `${cfg.lang}-${cfg.theme}` });
  try {
    const firstRun = await ctx.mainEval(`return { locale: app.getLocale(), storedLanguage: store.getSettings().language }`);
    console.log('first-run', cfg, firstRun);
    results.push({ window: 'first-run-language', lang: cfg.lang, theme: cfg.theme, ...firstRun });
    const wel = await ctx.pageFor('welcome.html');
    watchConsole(wel);
    await wel.reload(); await sleep(1200);
    const steps = await wel.evaluate(() => document.querySelectorAll('.step').length);
    for (let i = 0; i < steps; i++) {
      await record(wel, `welcome-firstrun-step${i}`, cfg, { doAxe: i === 0 });
      if (i < steps - 1) { await wel.click('#nextBtn'); await sleep(500); }
    }
    await closeWindows(ctx, 'welcome.html');

    // ---- seed language/theme + realistic data
    await ctx.mainEval(`
      store.saveSettings({ language: ${JSON.stringify(cfg.lang)}, theme: ${JSON.stringify(cfg.theme)}, quietHours: { enabled: false, start: '22:30', end: '07:15' } });
      store.saveCustomActionRules([
        { id: 'r1', label: 'מספר הזמנה פנימי', pattern: 'ORD-(\\\\d+)', urlTemplate: 'https://crm.example.com/orders/{value}', actionLabel: 'פתח הזמנה', enabled: true },
        { id: 'r2', label: 'Ticket (תמיכה)', pattern: 'TKT-(\\\\d+)', urlTemplate: 'https://help.example.com/t/{value}', actionLabel: '', enabled: false }
      ]);
      store.saveTagRules([{ id: 'g1', label: 'פרויקט', keywords: ['פרויקט', 'project'] }]);
      store.saveLeadSettings({ whatsappNumber: '050-1234567', webhookUrl: 'https://hooks.example.com/abc?x=1', emailAddress: 'leads@example.com', channelEmail: true, channelWebhook: true });
      store.addClipboardHistoryItem({ text: ${JSON.stringify(TEST)}, category: 'phone', actions: [{ label: 'WhatsApp: 050-1234567', url: 'https://wa.me/972501234567' }], tags: [] });
      store.addClipboardHistoryItem({ text: 'https://example.com/he/מאמר?id=12', category: 'url', actions: [{ label: 'פתח example.com', url: 'https://example.com' }], tags: ['פרויקט'] });
      store.addClipboardHistoryItem({ text: 'רחוב הרצל 12, תל אביב (קומה 3)', category: 'address', actions: null, tags: [] });
      store.addHistoryEntry({ display: '050-1234567', normalized: '972501234567', name: 'John כהן', templateLabel: 'ליד חדש' });
      return true;`);

    // ---- Welcome reopened later (tray "what is TapAct"), language now saved
    await ctx.mainEval(`const T = require('./lib/i18n-renderer').t; const lbls = [T('he', 'tray.about'), T('en', 'tray.about')]; const it = global.__menu.items.find(i => lbls.includes(i.label)); if (it) it.click(); return it ? it.label : null;`);
    try {
      const wel2 = await ctx.pageFor('welcome.html', 6000);
      watchConsole(wel2); await sleep(1200);
      await record(wel2, 'welcome-reopened-step0', cfg);
      await closeWindows(ctx, 'welcome.html');
    } catch (e) { console.log('welcome reopen not found', e.message); }

    // ---- Settings
    await ctx.mainEval(`app.emit('second-instance'); return true;`);
    const st = await ctx.pageFor('settings.html');
    watchConsole(st);
    await sleep(1500);
    for (const size of [[1040, 780], [860, 620]]) {
      await ctx.mainEval(`const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('settings.html')); w.setContentSize(${size[0]}, ${size[1]}); return true;`);
      await sleep(400);
      const tabs = size[0] === 1040 ? TABS : ['templates', 'settings', 'leads'];
      for (const tab of tabs) {
        await st.click(`.nav-btn[data-tab="${tab}"]`); await sleep(450);
        await record(st, `settings-${tab}__${size[0]}x${size[1]}`, cfg, { doAxe: size[0] === 1040 });
      }
    }
    await closeWindows(ctx, 'settings.html');

    // ---- Clipboard history quick panel
    await ctx.mainEval(`global.__sc['CommandOrControl+Alt+V'](); return true;`);
    const hist = await ctx.pageFor('clipboard-history.html');
    watchConsole(hist); await sleep(1200);
    await record(hist, 'clipboard-history', cfg);
    await closeWindows(ctx, 'clipboard-history.html');

    // ---- Phone popup (automatic detection path)
    await ctx.mainEval(`global.__clip = ${JSON.stringify(TEST)}; return true;`);
    const pop = await ctx.pageFor('popup/popup.html');
    watchConsole(pop); await sleep(1500);
    await record(pop, 'popup-phone', cfg);
    await closeWindows(ctx, 'popup/popup.html');

    // ---- Action popups (url, address)
    const acts = [['action-url', 'https://example.com/he/מאמר?id=12&a=b'], ['action-address', 'רחוב הרצל 12, תל אביב']];
    for (const [name, text] of acts) {
      await ctx.mainEval(`global.__clip = ${JSON.stringify(text)}; return true;`);
      try {
        const ap = await ctx.pageFor('action-popup.html', 8000);
        watchConsole(ap); await sleep(1300);
        await record(ap, name, cfg);
        await closeWindows(ctx, 'action-popup.html');
      } catch (e) { console.log(name, 'not shown', e.message); results.push({ window: name, lang: cfg.lang, theme: cfg.theme, error: 'not shown' }); }
    }
  } finally {
    await ctx.close();
  }
}

(async () => {
  for (const cfg of CONFIGS) await runConfig(cfg);
  const file = path.join(OUT, `browser-${LABEL}${ONLY.length ? '-' + ONLY.join('_') : ''}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 1));
  console.log('wrote', file, results.length);
})().catch((e) => { console.error(e); process.exit(1); });
