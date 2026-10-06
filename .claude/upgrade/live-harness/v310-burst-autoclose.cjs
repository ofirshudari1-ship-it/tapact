// Live: burst guard, auto-close timing, countdown holds (focus / more options / hover).
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, sleep, waitFor } = require('./lib.cjs');
const OUT = path.resolve(__dirname, '..', 'v310');
fs.mkdirSync(OUT, { recursive: true });
const LANG = process.env.LANG_UI || 'he';
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); };
const PS = path.join(OUT, 'setcursor.ps1');
const setCursor = (x, y) => execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS, String(x), String(y)]);
const popups = (ctx) => ctx.mainEval(`return BrowserWindow.getAllWindows().filter(w => /popup\\.html$/.test(w.webContents.getURL().split('?')[0])).map(w => w.getBounds())`);
const closeAll = (ctx) => ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => /popup\\.html/.test(w.webContents.getURL())).forEach(w => w.destroy()); return true`);

(async () => {
  const seed = { settings: { welcomeSeen: true, languageResolved: true, language: LANG, theme: 'dark' } };
  const ctx = await launch({ lang: LANG === 'he' ? 'he-IL' : 'en-US', seed, tag: 'v310b', nodePort: 9459, rdPort: 9453 });
  try {
    setCursor(900, 500); await sleep(1000);
    // ---- auto-close: untouched popup closes by itself at ~7s ----
    await ctx.mainEval(`global.__clip = '050-1000001'; return true`);
    await waitFor(async () => (await popups(ctx)).length === 1, 6000, 100);
    const t0 = Date.now();
    await waitFor(async () => (await popups(ctx)).length === 0, 15000, 100);
    const dt = (Date.now() - t0) / 1000;
    check('untouched popup closes by itself after ~7s', dt > 5.5 && dt < 8.8, { seconds: dt });
    await sleep(21000);

    // ---- holds: focused field keeps it open past 7s, then releases and restarts ----
    await ctx.mainEval(`global.__clip = '050-1000002'; return true`);
    await waitFor(async () => (await popups(ctx)).length === 1, 6000, 100);
    const pg = await ctx.pageFor('popup/popup.html'); await sleep(1200);
    await pg.focus('#messageArea');
    await sleep(500);
    const heldBar = await pg.evaluate(() => document.getElementById('countdown').classList.contains('idle'));
    await sleep(8500);
    const stillOpen = (await popups(ctx)).length === 1;
    check('typing/focus in the message field pauses auto-close (bar hidden, popup open after 9s)', heldBar && stillOpen, { heldBar, stillOpen });
    await pg.evaluate(() => document.activeElement.blur());
    await sleep(600);
    const barBack = await pg.evaluate(() => !document.getElementById('countdown').classList.contains('idle'));
    check('after leaving the field the countdown restarts (bar visible again)', barBack, barBack);
    // "more options" open holds it too
    await pg.evaluate(() => document.getElementById('moreOptions').open = true);
    await sleep(500);
    const moreHold = await pg.evaluate(() => document.getElementById('countdown').classList.contains('idle'));
    check('"More options" open pauses the countdown', moreHold, moreHold);
    await pg.evaluate(() => document.getElementById('moreOptions').open = false);
    await pg.evaluate(() => document.documentElement.dispatchEvent(new Event('mouseenter')));
    await sleep(400);
    const hoverHold = await pg.evaluate(() => document.getElementById('countdown').classList.contains('idle'));
    check('hover pauses the countdown', hoverHold, hoverHold);
    await pg.screenshot({ path: path.join(OUT, `popup-held__${LANG}.png`) });
    await closeAll(ctx);
    await sleep(21000);

    // ---- burst ----
    for (let i = 0; i < 5; i++) {
      await ctx.mainEval(`global.__clip = '05${i}-88899${i}${i}'; return true`);
      await sleep(900);
    }
    const pops = await popups(ctx);
    let hintShown = false;
    if (pops.length) { const p2 = await ctx.pageFor('popup/popup.html'); hintShown = await p2.evaluate(() => !document.getElementById('burstHint').classList.contains('hidden')); await p2.screenshot({ path: path.join(OUT, `popup-burst-hint__${LANG}.png`) }); }
    check('burst: 5 copies in ~5s -> one popup left, with the "paused for a minute" hint', pops.length === 1 && hintShown, { pops: pops.length, hintShown });
    await closeAll(ctx);
    await ctx.mainEval(`global.__clip = '059-0001112'; return true`);
    await sleep(1500);
    check('during the 60s pause one more copy opens nothing', (await popups(ctx)).length === 0);
    const tip = await ctx.mainEval(`return global.__menu ? 'menu-ok' : 'no-menu'`);
    await sleep(60000);
    await ctx.mainEval(`global.__clip = '059-0001113'; return true`);
    await waitFor(async () => (await popups(ctx)).length === 1, 6000, 150).catch(() => {});
    check('after the 60s pause popups work again', (await popups(ctx)).length === 1);
    check('no Windows balloon during any of it', (await ctx.mainEval(`return global.__balloons || 0`)) === 0);
  } catch (e) {
    console.error('ERROR', e); results.push({ name: 'exception', ok: false, extra: String(e).slice(0, 300) });
  } finally {
    fs.writeFileSync(path.join(OUT, `burst-autoclose__${LANG}.json`), JSON.stringify(results, null, 1));
    await ctx.close();
    console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  }
})();
