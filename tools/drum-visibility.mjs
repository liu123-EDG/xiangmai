/* 鼓什么时候"真的看得见" vs 文字什么时候出现
   一直只量了状态（section/words），没量过**可见性**。
   用户说"鼓出来的时候就已经到叙事了" —— 大概率是可见性问题，不是状态问题。 */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(root, p === '/' ? '/index.html' : p);
    const st = await stat(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size, 'accept-ranges': 'bytes' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-vis');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10131',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10131/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  /* 先看看鼓所在那一层的可见性链：谁会给它设 opacity / visibility */
  const chain = JSON.parse(await evalJs(`(() => {
    const out = [];
    let el = document.querySelector('.drum');
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      out.push({
        sel: el.id ? '#' + el.id : (el.className && el.className.baseVal !== undefined
          ? '.' + el.className.baseVal.split(' ')[0] : '.' + String(el.className).split(' ')[0]),
        op: +(+cs.opacity).toFixed(3),
        vis: cs.visibility,
        disp: cs.display,
        pe: cs.pointerEvents,
      });
      el = el.parentElement;
    }
    return JSON.stringify(out);
  })()`));
  console.log('\n[鼓的可见性链]  从鼓往上到 html\n');
  chain.forEach((c) => console.log('  ' + c.sel.padEnd(22) +
    ' opacity ' + String(c.op).padStart(5) + '   visibility ' + c.vis.padEnd(9) + ' display ' + c.disp));

  /* 逐级滚动，同时记录：鼓的可见性 / 文字出现 / 段号 */
  console.log('\n[滚动过程：鼓什么时候看得见]\n');
  console.log('    y  progress  stage  鼓op   鼓vis   鼓段  亮着的词   词的op');

  const heroH = JSON.parse(await evalJs(`(() => {
    const h = document.getElementById('hero');
    return JSON.stringify({ top: h.offsetTop, h: h.offsetHeight, vh: innerHeight });
  })()`));
  const denom = Math.max(1, heroH.h - heroH.vh);

  for (let y = 0; y <= denom + 40; y += 140) {
    await evalJs(`scrollTo(0, ${y})`);
    await sleep(420);
    const s = JSON.parse(await evalJs(`(() => {
      const drum = document.querySelector('.drum');
      const d = window.__XM_DRUM__;
      const host = document.querySelector('.drum-host');
      const cs = drum ? getComputedStyle(drum) : null;
      const hcs = host ? getComputedStyle(host) : null;
      const words = [...document.querySelectorAll('.word')];
      const shown = words.filter((w) => w.classList.contains('is-shown'));
      const hero = document.getElementById('hero');
      return JSON.stringify({
        p: +((scrollY - hero.offsetTop) / ${denom}).toFixed(3),
        stage: document.body.dataset.stage,
        drumOp: cs ? +(+cs.opacity).toFixed(3) : null,
        hostOp: hcs ? +(+hcs.opacity).toFixed(3) : null,
        drumVis: cs ? cs.visibility : null,
        sec: d ? d.state().section : null,
        word: shown.length ? shown[0].textContent.trim() : '（无）',
        wordOp: shown.length ? +(+getComputedStyle(shown[0]).opacity).toFixed(2) : 0,
      });
    })()`));
    console.log('  ' + String(y).padStart(5) + '   ' + String(s.p).padStart(7) +
      '   ' + String(s.stage).padStart(3) + '   ' + String(s.drumOp).padStart(5) +
      '  ' + String(s.drumVis).padEnd(9) + String(s.sec).padStart(4) + '   ' +
      s.word.padEnd(8) + '  ' + String(s.wordOp).padStart(5));
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
