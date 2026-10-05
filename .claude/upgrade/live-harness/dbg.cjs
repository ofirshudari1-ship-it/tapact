const { launch, sleep } = require('./lib.cjs');
(async () => {
  const ctx = await launch({ lang: 'he-IL', tag: 'dbg' });
  try {
    await sleep(2500);
    console.log(await ctx.mainEval(`return { labels: global.__menu ? global.__menu.items.map(i => i.label) : null, t: require('./lib/i18n-renderer').t(store.getSettings().language, 'tray.about'), now: new Date().toString() }`));
  } finally { await ctx.close(); }
})().catch(e => { console.error(e); process.exit(1); });
