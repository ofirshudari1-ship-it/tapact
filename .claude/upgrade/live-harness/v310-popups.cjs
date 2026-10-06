// Live checks for v3.10.0 popup behavior (policy, placement, snooze, burst,
// countdown). Runs the real main.js through lib.cjs in an isolated profile.
// Moves the REAL mouse cursor (SetCursorPos) - do not touch the mouse while it runs.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { launch, probe, axe, sleep, waitFor } = require('./lib.cjs');

const OUT = path.resolve(__dirname, '..', 'v310');
fs.mkdirSync(OUT, { recursive: true });
const LANG = process.env.LANG_UI || 'he';
const THEME = process.env.THEME || 'dark';
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); };

const PS = path.join(OUT, 'setcursor.ps1');
fs.writeFileSync(PS, `param([int]$x,[int]$y)
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class W32 { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'
[W32]::SetCursorPos($x,$y) | Out-Null`);
const setCursor = (x, y) => execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS, String(x), String(y)]);

async function popups(ctx) {
  return ctx.mainEval(`return BrowserWindow.getAllWindows().filter(w => /popup\\.html$/.test(w.webContents.getURL().split('?')[0])).map(w => ({ url: w.webContents.getURL().split('?')[0].split('/').slice(-2).join('/'), b: w.getBounds() }))`);
}
const closeAll = (ctx) => ctx.mainEval(`BrowserWindow.getAllWindows().filter(w => /popup\\.html/.test(w.webContents.getURL())).forEach(w => w.destroy()); return true`);

(async () => {
  const seed = { settings: { welcomeSeen: true, languageResolved: true, language: LANG, theme: THEME } };
  const ctx = await launch({ lang: LANG === 'he' ? 'he-IL' : 'en-US', seed, tag: 'v310', nodePort: 9439, rdPort: 9433 });
  try {
    // Make the clipboard stub behave like a real clipboard for app writes, and count balloons / focus.
    await ctx.mainEval(`const e = require('electron'); e.clipboard.writeText = async (t) => { global.__clip = t; global.__clipWritten.push(t); };
      global.__balloons = 0; e.Tray.prototype.displayBalloon = function () { global.__balloons++; };
      global.__focused = false; const gf = e.BrowserWindow.getFocusedWindow; e.BrowserWindow.getFocusedWindow = () => (global.__focused ? { isDestroyed: () => false } : null);
      return true;`);
    const info = await ctx.mainEval(`const { screen } = require('electron'); return { displays: screen.getAllDisplays().map(d => ({ id: d.id, b: d.bounds, wa: d.workArea, sf: d.scaleFactor })), s: store.getSettings() }`);
    console.log('displays', JSON.stringify(info.displays));
    check('defaults: pollMs=400 autoClose=7 no showTrayNotification/startMinimized', info.s.pollMs === 400 && info.s.autoCloseSeconds === 7 && !('showTrayNotification' in info.s) && !('startMinimized' in info.s), { pollMs: info.s.pollMs, ac: info.s.autoCloseSeconds });

    // ---------- B: policy ----------
    // (1) long block of text with a number: logged to history, no popup
    await ctx.mainEval(`global.__clip = 'שלום, אשמח שתחזרו אליי בהקדם בנוגע להצעת המחיר שקיבלתי אתמול. הטלפון שלי 050-1234567 ואפשר גם במייל.'; return true`);
    await sleep(1500);
    let pops = await popups(ctx);
    const hist1 = await ctx.mainEval(`return store.getClipboardHistory().length`);
    check('long text containing a phone: no popup, still in history', pops.length === 0 && hist1 === 1, { pops: pops.length, hist: hist1 });

    // (2) TapAct writing to the clipboard itself (history paste) must not pop
    await ctx.mainEval(`store.addClipboardHistoryItem({ text: '052-7654321', category: 'phone', actions: null, tags: [] }); return true`);
    const itemId = await ctx.mainEval(`return store.getClipboardHistory().find(i => i.text === '052-7654321').id`);
    await ctx.mainEval(`require('electron').ipcMain.emit('history-panel:copy-item', {}, ${JSON.stringify(itemId)}); return true`);
    await sleep(1500);
    pops = await popups(ctx);
    const clipNow = await ctx.mainEval(`return global.__clip`);
    check('paste from history writes the clipboard but opens no popup', clipNow === '052-7654321' && pops.length === 0, { clip: clipNow, pops: pops.length });

    // (3) copy while a TapAct window is focused
    await ctx.mainEval(`global.__focused = true; global.__clip = '053-1112223'; return true`);
    await sleep(1500);
    pops = await popups(ctx);
    await ctx.mainEval(`global.__focused = false; return true`);
    await sleep(1200); // the focus flag is sampled per poll tick: let it settle
    check('copy while a TapAct window is focused: no popup', pops.length === 0, { pops: pops.length });

    // (4) a plain phone copy opens one, with NO Windows balloon
    await ctx.mainEval(`global.__clip = '054-2223334'; return true`);
    await waitFor(async () => (await popups(ctx)).length === 1, 6000, 200).catch(() => {});
    pops = await popups(ctx);
    const balloons = await ctx.mainEval(`return global.__balloons`);
    check('plain phone copy opens the popup and no Windows balloon fires', pops.length === 1 && balloons === 0, { pops: pops.length, balloons });
    await closeAll(ctx);
    await sleep(21000);

    // ---------- E: placement at 5 positions (10.5s gaps keep the burst guard quiet) ----------
    const spots = [];
    for (let di = 0; di < info.displays.length; di++) {
      const dd = info.displays[di]; const wa = dd.wa;
      if (di === 0) spots.push(['d0 top-left', di, wa.x + 4, wa.y + 4], ['d0 top-right', di, wa.x + wa.width - 6, wa.y + 4], ['d0 bottom-left', di, wa.x + 4, wa.y + wa.height - 6], ['d0 bottom-right', di, wa.x + wa.width - 6, wa.y + wa.height - 6], ['d0 center', di, wa.x + Math.round(wa.width / 2), wa.y + Math.round(wa.height / 2)]);
      else spots.push([`d${di} top-left`, di, wa.x + 4, wa.y + 4], [`d${di} bottom-right`, di, wa.x + wa.width - 6, wa.y + wa.height - 6], [`d${di} center`, di, wa.x + Math.round(wa.width / 2), wa.y + Math.round(wa.height / 2)]);
    }
    let n = 0;
    for (const [name, di, x, y] of spots) {
      const d = info.displays[di];
      setCursor(x, y);
      await sleep(1200); // >= 2 poll ticks at the new position
      const cur = await ctx.mainEval(`return require('electron').screen.getCursorScreenPoint()`);
      await ctx.mainEval(`global.__clip = '05${n}-55566${n}7'; return true`);
      n++;
      await waitFor(async () => (await popups(ctx)).length === 1, 6000, 200).catch(() => {});
      await sleep(1500);
      pops = await popups(ctx);
      const b = pops[0] && pops[0].b;
      if (!b) { check(`placement ${name}: popup opened`, false); continue; }
      const wa = d.wa;
      const inside = b.x >= wa.x && b.y >= wa.y && b.x + b.width <= wa.x + wa.width && b.y + b.height <= wa.y + wa.height;
      const covers = cur.x >= b.x && cur.x <= b.x + b.width && cur.y >= b.y && cur.y <= b.y + b.height;
      const dx = Math.max(b.x - cur.x, 0, cur.x - (b.x + b.width));
      const dy = Math.max(b.y - cur.y, 0, cur.y - (b.y + b.height));
      const dist = Math.max(dx, dy);
      check(`placement ${name} (display ${di}, scale ${d.sf}): cursor (${cur.x},${cur.y}) popup (${b.x},${b.y},${b.width}x${b.height}) inside that display, not on cursor, adjacent (<=20px)`, inside && !covers && dist <= 20, { inside, covers, dist });
      if (['d0 center', 'd0 top-left', 'd1 center'].includes(name)) {
        const pg0 = await ctx.pageFor('popup/popup.html');
        await pg0.screenshot({ path: path.join(OUT, `popup-${name.replace(' ', '-')}__${LANG}__${THEME}.png`) });
      }
      await closeAll(ctx);
      await sleep(n % 2 === 0 ? 100 : 100);
      if (n % 2 === 0) await sleep(21000); // burst guard: at most 2 popups per 20s window
    }
    await sleep(21000); // let the burst window fully expire
    const d = info.displays[0]; const W = d.wa.width; const H = d.wa.height;

    // ---------- Pre-copy cursor: cursor moves AFTER the copy, popup stays at the copy spot ----------
    setCursor(Math.round(W / 3), Math.round(H / 3));
    await sleep(1200);
    const copySpot = await ctx.mainEval(`return require('electron').screen.getCursorScreenPoint()`);
    await ctx.mainEval(`global.__clip = '058-1239876'; return true`);
    await sleep(120);
    setCursor(Math.round(W * 0.8), Math.round(H * 0.8)); // mouse flies away right after the copy
    await waitFor(async () => (await popups(ctx)).length === 1, 6000, 200).catch(() => {});
    await sleep(1200);
    pops = await popups(ctx);
    const pb = pops[0] && pops[0].b;
    const nearCopy = pb && Math.max(Math.max(pb.x - copySpot.x, 0, copySpot.x - (pb.x + pb.width)), Math.max(pb.y - copySpot.y, 0, copySpot.y - (pb.y + pb.height))) <= 20;
    check('cursor moved away right after the copy: popup is still at the copy position (pre-change sample)', !!nearCopy, { copySpot, b: pb });
    await closeAll(ctx);
    await sleep(21000);

    // ---------- C: snooze menu (live in the popup) ----------
    setCursor(Math.round(W / 2), Math.round(H / 2));
    await sleep(900);
    await ctx.mainEval(`global.__clip = '050-9998887'; return true`);
    let pg = await ctx.pageFor('popup/popup.html');
    await sleep(1300);
    await pg.click('#snoozeBtn'); await sleep(500);
    const panelVisible = await pg.evaluate(() => !document.getElementById('snoozePanel').classList.contains('hidden') && document.querySelector('.app').classList.contains('snooze-open'));
    const cdBar = await pg.evaluate(() => document.getElementById('countdown').className);
    check('snooze menu opens in place of the body; countdown bar hidden while the menu holds it', panelVisible && /idle/.test(cdBar), { cdBar });
    await pg.screenshot({ path: path.join(OUT, `popup-snooze-menu__${LANG}__${THEME}.png`) });
    const axMenu = await axe(pg);
    check('axe popup with snooze menu: serious/critical = 0', axMenu.filter((v) => ['serious', 'critical'].includes(v.impact)).length === 0, axMenu);
    await pg.keyboard.press('Escape'); await sleep(500);
    const afterEsc = await pg.evaluate(() => ({ open: document.querySelector('.app').classList.contains('snooze-open') }));
    pops = await popups(ctx);
    check('Esc closes the menu first (popup still open)', !afterEsc.open && pops.length === 1, afterEsc);
    // countdown bar visible and running once the menu is released and the mouse is away
    await pg.evaluate(() => document.documentElement.dispatchEvent(new Event('mouseleave')));
    await sleep(900);
    const bar = await pg.evaluate(() => { const c = document.getElementById('countdown'); const f = c.firstElementChild; return { idle: c.classList.contains('idle'), anims: f.getAnimations().length, t: getComputedStyle(f).transform }; });
    check('countdown bar is visible and animating when nothing holds the countdown', !bar.idle && bar.anims === 1, bar);
    await pg.screenshot({ path: path.join(OUT, `popup-countdown__${LANG}__${THEME}.png`) });
    // choose 15 minutes
    await pg.click('#snoozeBtn'); await sleep(300);
    await pg.click('#snoozePanel [data-kind="m15"]'); await sleep(900);
    pops = await popups(ctx);
    const sn = await ctx.mainEval(`return { until: store.getSettings().snoozeUntil, now: Date.now() }`);
    check('15 min snooze: popup closed and snoozeUntil ~ now+15min', pops.length === 0 && Math.abs((sn.until - sn.now) - 15 * 60000) < 5000, { diffMin: (sn.until - sn.now) / 60000 });
    // copy while snoozed -> no popup but history continues
    const h0 = await ctx.mainEval(`return store.getClipboardHistory().length`);
    await ctx.mainEval(`global.__clip = '050-1112220'; return true`);
    await sleep(1500);
    pops = await popups(ctx);
    const h1 = await ctx.mainEval(`return store.getClipboardHistory().length`);
    check('copy while snoozed: no popup, history still logs', pops.length === 0 && h1 === h0 + 1, { h0, h1 });
    // tray label
    const trayLabel = await ctx.mainEval(`return global.__menu.items.map(i => i.label).filter(l => /\\d\\d:\\d\\d/.test(l))`);
    check('tray menu shows "snoozed until HH:MM - resume now"', trayLabel.length >= 1, trayLabel);
    // manual trigger ignores snooze
    await ctx.mainEval(`global.__sc['CommandOrControl+Alt+P'](); return true`);
    await sleep(1500);
    pops = await popups(ctx);
    check('manual shortcut opens a popup even while snoozed', pops.length === 1, pops.length);
    await closeAll(ctx);
    // resume from tray
    await ctx.mainEval(`const it = global.__menu.items.find(i => /\\d\\d:\\d\\d/.test(i.label)); it.click(); return true`);
    const sn2 = await ctx.mainEval(`return store.getSettings().snoozeUntil`);
    check('tray "resume now" clears the snooze', sn2 === 0, sn2);
    // expiry auto-clears: set a past value, read settings via the same path main uses
    await ctx.mainEval(`store.saveSettings({ snoozeUntil: Date.now() - 1000 }); return true`);
    await ctx.mainEval(`global.__clip = '050-3334445'; return true`);
    await waitFor(async () => (await popups(ctx)).length === 1, 6000, 200).catch(() => {});
    pops = await popups(ctx);
    const sn3 = await ctx.mainEval(`return store.getSettings().snoozeUntil`);
    check('expired snooze auto-clears and popups work again', pops.length === 1 && sn3 === 0, { pops: pops.length, sn3 });
    await closeAll(ctx);

    // per-type "do not show for phone numbers"
    await sleep(21000);
    await ctx.mainEval(`global.__clip = '050-7776665'; return true`);
    pg = await ctx.pageFor('popup/popup.html'); await sleep(1300);
    await pg.click('#snoozeBtn'); await sleep(300);
    const typeTxt = await pg.evaluate(() => document.getElementById('snoozeTypeBtn').textContent);
    await pg.click('#snoozeTypeBtn'); await sleep(900);
    const det = await ctx.mainEval(`return store.getSettings().detectors`);
    check(`per-type skip turns the phone detector off ("${typeTxt}")`, det.phone === false, det);
    await ctx.mainEval(`store.saveSettings({ detectors: { phone: true } }); return true`);

    await sleep(21000); // burst window expiry before the burst test
    // ---------- B4: burst guard ----------
    for (let i = 0; i < 5; i++) {
      await ctx.mainEval(`global.__clip = '05${i}-88899${i}${i}'; return true`);
      await sleep(900);
    }
    pops = await popups(ctx);
    const hintShown = pops[0] ? await (await ctx.pageFor('popup/popup.html')).evaluate(() => !document.getElementById('burstHint').classList.contains('hidden')) : false;
    const opened = await ctx.mainEval(`return 0`);
    check('burst: copying 5 numbers in ~5s leaves a popup with the "paused for a minute" hint, further ones suppressed', pops.length === 1 && hintShown, { pops: pops.length, hintShown });
    await closeAll(ctx);
    await ctx.mainEval(`global.__clip = '059-0001112'; return true`);
    await sleep(1500);
    pops = await popups(ctx);
    check('during the 60s pause an extra copy opens nothing', pops.length === 0, pops.length);
    const balloons2 = await ctx.mainEval(`return global.__balloons`);
    check('no Windows balloon at any point during the copy tests', balloons2 === 0, balloons2);
  } catch (e) {
    console.error('ERROR', e);
    results.push({ name: 'exception', ok: false, extra: String(e).slice(0, 300) });
  } finally {
    fs.writeFileSync(path.join(OUT, `popups__${LANG}__${THEME}.json`), JSON.stringify(results, null, 1));
    await ctx.close();
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  }
})();
