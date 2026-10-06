// Live: clicking WhatsApp in the phone popup opens the chat (recorded, not really opened) and the popup closes by itself.
const { launch, sleep, waitFor } = require('./lib.cjs');
const popups = (ctx) => ctx.mainEval(`return BrowserWindow.getAllWindows().filter(w => /popup\.html$/.test(w.webContents.getURL().split('?')[0])).length`);
(async () => {
  const seed = { settings: { welcomeSeen: true, languageResolved: true, language: 'he', theme: 'dark' } };
  const ctx = await launch({ lang: 'he-IL', seed, tag: 'v3102', nodePort: 9469, rdPort: 9463 });
  try {
    await sleep(1000);
    await ctx.mainEval(`global.__clip = '052-3334455'; return true`);
    await waitFor(async () => (await popups(ctx)) === 1, 6000, 100);
    const pg = await ctx.pageFor('popup/popup.html'); await sleep(1200);
    const t0 = Date.now();
    await pg.click('#btnWhatsapp');
    let closedAfter = null;
    while (Date.now() - t0 < 6000) { if ((await popups(ctx)) === 0) { closedAfter = Date.now() - t0; break; } await sleep(50); }
    const ext = await ctx.mainEval(`return JSON.stringify(global.__ext || null)`);
    console.log('recorded openExternal calls:', ext);
    console.log((/wa\.me\/972523334455/.test(ext) ? 'PASS' : 'FAIL') + '  WhatsApp link opened for 972523334455');
    console.log((closedAfter !== null && closedAfter < 2500 ? 'PASS' : 'FAIL') + '  popup closed itself ' + closedAfter + 'ms after the click (expected ~500ms, auto-close would be ~7000ms)');
  } finally { await ctx.close(); }
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
