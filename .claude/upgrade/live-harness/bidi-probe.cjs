// Measures where substrings actually render (Range.getClientRects), so bidi
// order is verified numerically instead of by eye.
// node bidi-probe.cjs [he|en]
const { launch, sleep } = require('./lib.cjs');
const LANG = process.argv[2] || 'he';
const TEST = 'שלום John 050-1234567 ₪1,234';

const MEASURE = (needles) => `(() => {
  const out = {};
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    for (const k of ${JSON.stringify(needles)}) {
      const i = n.textContent.indexOf(k);
      if (i < 0 || out[k]) continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + k.length);
      const b = r.getBoundingClientRect();
      out[k] = { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top) };
    }
  }
  return out;
})()`;

(async () => {
  const ctx = await launch({ lang: LANG === 'he' ? 'he-IL' : 'en-US', tag: 'bidi' });
  try {
    await ctx.pageFor('welcome.html');
    await ctx.mainEval(`store.saveSettings({ language: '${LANG}', welcomeSeen: true });
      store.addClipboardHistoryItem({ text: ${JSON.stringify(TEST)}, category: 'phone', actions: null, tags: [] });
      store.addClipboardHistoryItem({ text: 'https://example.com/he/מאמר?id=12', category: 'url', actions: null, tags: [] });
      return true;`);
    await ctx.mainEval(`global.__sc['CommandOrControl+Alt+V'](); return true;`);
    const hist = await ctx.pageFor('clipboard-history.html');
    await sleep(1200);
    console.log('history', JSON.stringify(await hist.evaluate(MEASURE(['שלום', 'John', '₪1,234', 'https://', 'id=12']))));
    await ctx.mainEval(`app.emit('second-instance'); return true;`);
    const st = await ctx.pageFor('settings.html');
    await sleep(1200);
    await st.click('.nav-btn[data-tab="shortcuts"]'); await sleep(300);
    console.log('shortcut', JSON.stringify(await st.evaluate(() => [...document.querySelectorAll('.shortcut-input')].map((el) => ({ v: el.value, dir: getComputedStyle(el).direction, align: getComputedStyle(el).textAlign, sw: el.scrollWidth, cw: el.clientWidth })))));
    await st.click('.nav-btn[data-tab="templates"]'); await sleep(300);
    console.log('template', JSON.stringify(await st.evaluate(() => { const ta = document.querySelector('#tab-templates textarea'); const cs = getComputedStyle(ta); return { ub: cs.unicodeBidi, align: cs.textAlign, dir: cs.direction }; })));
  } finally { await ctx.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
