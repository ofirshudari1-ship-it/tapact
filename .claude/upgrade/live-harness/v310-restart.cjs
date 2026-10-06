// Live: an old profile (v3.9.1 values) is migrated on launch, a saved snooze survives a restart,
// and a fresh install still shows the welcome guide (start-minimized toggle is gone).
const { launch, sleep, waitFor } = require('./lib.cjs');
const results = [];
const check = (name, ok, extra) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); };
const popups = (ctx) => ctx.mainEval(`return BrowserWindow.getAllWindows().filter(w => /popup\\.html$/.test(w.webContents.getURL().split('?')[0])).length`);

(async () => {
  const until = Date.now() + 40 * 60 * 1000;
  const seed = { settings: { welcomeSeen: true, languageResolved: true, language: 'he', pollMs: 800, autoCloseSeconds: 10, showTrayNotification: true, startMinimized: true, trayBalloonOffApplied: true, snoozeUntil: until } };
  let ctx = await launch({ lang: 'he-IL', seed, tag: 'v310r', nodePort: 9499, rdPort: 9493 });
  try {
    await sleep(1500);
    const s = await ctx.mainEval(`return store.getSettings()`);
    check('old profile migrated: poll 800->400, autoClose 10->7, removed keys gone, snooze kept', s.pollMs === 400 && s.autoCloseSeconds === 7 && !('showTrayNotification' in s) && !('startMinimized' in s) && s.snoozeUntil === until, { poll: s.pollMs, ac: s.autoCloseSeconds, snooze: s.snoozeUntil === until });
    await ctx.mainEval(`global.__clip = '050-4443332'; return true`);
    await sleep(1800);
    check('snooze loaded from disk at startup: copy opens no popup', (await popups(ctx)) === 0);
    const lbl = await ctx.mainEval(`return global.__menu.items.map(i => i.label).filter(l => /\\d\\d:\\d\\d/.test(l))`);
    check('tray shows the restored snooze', lbl.length === 1, lbl);
  } finally { await ctx.close(); }
  ctx = await launch({ lang: 'he-IL', seed: null, tag: 'v310f', nodePort: 9509, rdPort: 9503 });
  try {
    const wel = await ctx.pageFor('welcome.html', 12000).catch(() => null);
    check('fresh install: welcome guide opens (no start-minimized setting involved)', !!wel);
    const s = await ctx.mainEval(`return store.getSettings()`);
    check('fresh install defaults: pollMs 400, autoClose 7, snoozeUntil 0', s.pollMs === 400 && s.autoCloseSeconds === 7 && s.snoozeUntil === 0, { poll: s.pollMs });
  } finally { await ctx.close(); }
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
