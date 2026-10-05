// Live harness for TapAct: runs the REAL desktop-agent main.js (not a stub),
// isolated from the user's install, and drives every window over CDP.
//
// - electron.exe --inspect-brk=<np> --remote-debugging-port=<rp> --lang=<loc> .
// - While paused on main.js line 1 (Node inspector), patches Electron APIs so
//   the run cannot touch the real machine:
//     userData -> temp dir, login item -> no-op, clipboard -> in-memory
//     (global.__clip), shell.openExternal -> recorded, globalShortcut ->
//     recorded callbacks (never grabbed OS-wide), BrowserWindow.show/focus ->
//     showInactive (never steals the user's focus), tray balloons -> no-op.
// - Renderer windows: playwright-core connectOverCDP.
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const PW = path.join(process.env.LOCALAPPDATA, 'npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core');
const { chromium } = require(PW);

const AGENT = path.resolve(__dirname, '../../../desktop-agent');
const ELECTRON = path.join(AGENT, 'node_modules/electron/dist/electron.exe');
const AXE_PATH = 'C:/Users/ofirs/Downloads/home-hub/node_modules/axe-core/axe.min.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitFor(fn, timeout = 15000, step = 150) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (_) { /* retry */ }
    if (Date.now() - t0 > timeout) throw new Error('waitFor timeout');
    await sleep(step);
  }
}

class NodeCdp {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.listeners = []; }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
        else if (msg.method) this.listeners.forEach((l) => l(msg));
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  once(method) { return new Promise((resolve) => { const l = (m) => { if (m.method === method) { this.listeners = this.listeners.filter((x) => x !== l); resolve(m.params); } }; this.listeners.push(l); }); }
  close() { try { this.ws.close(); } catch (_) {} }
}

const PATCH = (ud) => `(() => {
  const require = process.getBuiltinModule('module').createRequire(${JSON.stringify(path.join(AGENT, 'src', 'main.js'))});
  const e = require('electron');
  e.app.setPath('userData', ${JSON.stringify(ud)});
  e.app.setLoginItemSettings = () => {};
  global.__clip = '';
  global.__clipWritten = [];
  e.clipboard.readText = async () => global.__clip;
  e.clipboard.read = async () => [];
  e.clipboard.writeText = async (t) => { global.__clipWritten.push(t); };
  global.__ext = [];
  e.shell.openExternal = async (u) => { global.__ext.push(u); };
  e.shell.beep = () => {};
  global.__sc = {};
  e.globalShortcut.register = (acc, cb) => { global.__sc[acc] = cb; return true; };
  e.globalShortcut.unregister = () => {};
  e.globalShortcut.unregisterAll = () => {};
  e.globalShortcut.isRegistered = () => false;
  const scm = e.Tray.prototype.setContextMenu;
  e.Tray.prototype.setContextMenu = function (m) { global.__menu = m; return scm.call(this, m); };
  e.Tray.prototype.displayBalloon = function () {};
  const BW = e.BrowserWindow;
  BW.prototype.show = function () { return this.showInactive(); };
  BW.prototype.focus = function () {};
  global.__req = require;
  return 'patched ' + e.app.getPath('userData');
})()`;

async function launch({ lang = 'he-IL', seed = null, tag = 'run', nodePort = 9339, rdPort = 9333 } = {}) {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), `tapact-live-${tag}-`));
  if (seed) fs.writeFileSync(path.join(ud, 'tapact.json'), JSON.stringify(seed));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const proc = spawn(ELECTRON, [`--inspect-brk=${nodePort}`, `--remote-debugging-port=${rdPort}`, `--lang=${lang}`, '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '.'], { cwd: AGENT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  proc.stdout.on('data', (d) => out.push(String(d)));
  proc.stderr.on('data', (d) => out.push(String(d)));
  const list = await waitFor(() => getJson(`http://127.0.0.1:${nodePort}/json/list`).then((l) => l.length && l));
  const node = new NodeCdp(list[0].webSocketDebuggerUrl);
  await node.open();
  const paused = node.once('Debugger.paused');
  await node.send('Runtime.enable');
  await node.send('Debugger.enable');
  await node.send('Runtime.runIfWaitingForDebugger');
  const p = await paused;
  const frame = p.callFrames[0].callFrameId;
  const r = await node.send('Debugger.evaluateOnCallFrame', { callFrameId: frame, expression: PATCH(ud), returnByValue: true });
  if (r.exceptionDetails) throw new Error('patch failed: ' + JSON.stringify(r.exceptionDetails));
  await node.send('Debugger.resume');
  await node.send('Debugger.disable');

  async function mainEval(expr) {
    const res = await node.send('Runtime.evaluate', { expression: `(async () => { const require = global.__req; const store = require('./lib/store'); const { BrowserWindow, app } = require('electron'); ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error('mainEval: ' + JSON.stringify(res.exceptionDetails).slice(0, 600));
    return res.result.value;
  }

  const browser = await waitFor(() => chromium.connectOverCDP(`http://127.0.0.1:${rdPort}`), 20000, 400);
  async function pageFor(fragment, timeout = 15000) {
    return waitFor(() => {
      for (const c of browser.contexts()) for (const pg of c.pages()) if (pg.url().includes(fragment) && !pg.isClosed()) return pg;
      return null;
    }, timeout);
  }
  async function close() {
    try { await browser.close(); } catch (_) {}
    node.close();
    try { proc.kill(); } catch (_) {}
    await sleep(600);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (_) {}
  }
  return { proc, node, browser, ud, mainEval, pageFor, close, out, patchResult: r.result.value };
}

// ---- in-page probes ----
const PROBES = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[hidden]'); };
  window.__probe = {
    texts() {
      const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el || !vis(el)) continue; if (el.closest('script,style')) continue; out.push({ t: t.slice(0, 160), tag: el.tagName.toLowerCase(), id: el.id || '', cls: String(el.className || '').slice(0, 40), dir: getComputedStyle(el).direction, user: Boolean(el.closest('[data-user-content],.template-text,.tpl-text,textarea,input')) }); }
      for (const el of document.querySelectorAll('input,textarea,select,button,[title],[aria-label]')) {
        if (!vis(el)) continue;
        for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && v.trim()) out.push({ t: v.trim().slice(0, 160), tag: el.tagName.toLowerCase(), id: el.id || '', attr: a, dir: getComputedStyle(el).direction }); }
      }
      return out;
    },
    fields() {
      return [...document.querySelectorAll('input,textarea,select')].filter(vis).map((el) => ({ tag: el.tagName.toLowerCase(), type: el.type || '', id: el.id || '', name: el.name || '', dirAttr: el.getAttribute('dir'), dir: getComputedStyle(el).direction, align: getComputedStyle(el).textAlign, value: String(el.value || '').slice(0, 60), ph: el.placeholder || '' }));
    },
    overflow() {
      const d = document.documentElement; const res = { docX: d.scrollWidth - d.clientWidth, docY: d.scrollHeight - d.clientHeight, clipped: [] };
      for (const el of document.querySelectorAll('body *')) { if (!vis(el)) continue; const cs = getComputedStyle(el); if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && el.textContent.trim()) res.clipped.push({ tag: el.tagName.toLowerCase(), id: el.id, cls: String(el.className).slice(0, 40), t: el.textContent.trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth }); }
      return res;
    },
    doc() { return { lang: document.documentElement.lang, dir: document.documentElement.dir, theme: document.documentElement.getAttribute('data-theme'), title: document.title, w: innerWidth, h: innerHeight }; }
  };
  return true;
})()`;

async function probe(page) {
  await page.evaluate(PROBES);
  return page.evaluate(() => ({ doc: window.__probe.doc(), texts: window.__probe.texts(), fields: window.__probe.fields(), overflow: window.__probe.overflow() }));
}

let AXE_SRC = null;
async function axe(page) {
  if (!AXE_SRC) AXE_SRC = fs.readFileSync(AXE_PATH, 'utf8');
  await page.evaluate(AXE_SRC);
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 4).map((x) => x.target.join(' ')) }));
  });
}

// Leak detection against the real i18n tables: a visible string that is an
// exact value of the OTHER language's table (and not of the current one).
function leakCheck(lang, texts) {
  const { STRINGS } = require(path.join(AGENT, 'src/lib/i18n-renderer.js'));
  const other = lang === 'he' ? 'en' : 'he';
  const cur = new Set(Object.values(STRINGS[lang]).map((s) => s.trim()));
  const oth = new Set(Object.values(STRINGS[other]).map((s) => s.trim()));
  // Intentionally bilingual / endonyms: the language switcher must be findable
  // by someone who cannot read the current language, and a language is named
  // in its own script ("עברית" in the English UI, "English" in the Hebrew UI).
  const ALLOW = [/^Change language \/ שנה שפה$/, /^שנה שפה \/ Change language$/, /^(🌐|🇮🇱)?\s*(עברית|עב)$/, /^(🌐|🇺🇸)?\s*English$/];
  const leaks = [];
  for (const x of texts) {
    if (x.user) continue;
    if (ALLOW.some((re) => re.test(x.t))) continue;
    if (oth.has(x.t) && !cur.has(x.t)) leaks.push({ ...x, why: 'other-lang-table' });
    else if (lang === 'en' && /[\u0590-\u05FF]/.test(x.t)) leaks.push({ ...x, why: 'hebrew-in-en' });
  }
  return leaks;
}

module.exports = { launch, probe, axe, leakCheck, sleep, waitFor, AGENT };
