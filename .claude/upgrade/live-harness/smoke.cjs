const { launch, probe, sleep } = require('./lib.cjs');
(async () => {
  const ctx = await launch({ lang: 'he-IL', tag: 'smoke' });
  console.log(ctx.patchResult);
  try {
    const pg = await ctx.pageFor('welcome.html');
    await sleep(1500);
    const p = await probe(pg);
    console.log(JSON.stringify(p.doc), p.texts.slice(0, 12).map(t => t.t).join(' | '));
    console.log(await ctx.mainEval(`return { ud: app.getPath('userData'), loc: app.getLocale(), lang: store.getSettings().language, sc: Object.keys(global.__sc) }`));
  } finally { console.log(ctx.out.join('').slice(-1500)); await ctx.close(); }
})().catch(e => { console.error(e); process.exit(1); });
