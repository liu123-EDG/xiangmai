/* 找出盖住鼓的那一层：遍历所有元素，凡是几何上盖住鼓中心、
   且在 DOM 里排在 .drum-host 后面的，全列出来。 */
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
const userDir = join(root, '.chrome-cover');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10281',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10281/json/list')).json();
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
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4400);

  console.log('\n[鼓正中心那一点上，几何上压着谁]\n');
  const out = await evalJs(`(() => {
    const drum = document.querySelector('.drum');
    const r = drum.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);

    // 鼓自己的祖先链
    const chain = [];
    let el = drum;
    while (el && el !== document.documentElement) {
      const c = getComputedStyle(el);
      chain.push((el.id ? '#' + el.id : (el.className.baseVal !== undefined
        ? '.' + el.className.baseVal.split(' ')[0] : '.' + String(el.className).split(' ')[0]))
        + ' [z=' + c.zIndex + ' op=' + c.opacity + ' vis=' + c.visibility
        + ' clip=' + c.clipPath + ' mask=' + c.maskImage + ' contain=' + c.contain
        + ' filter=' + c.filter + ' tf=' + (c.transform === 'none' ? '-' : 'Y') + ']');
      el = el.parentElement;
    }

    // 所有几何上覆盖中心点的元素，按 DOM 顺序列出（后面的会盖住前面的）
    const all = [...document.querySelectorAll('body *')];
    const drumIdx = all.indexOf(drum);
    const covering = [];
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (e === drum || drum.contains(e)) continue;
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) continue;
      const c = getComputedStyle(e);
      covering.push({
        sel: (e.id ? '#' + e.id : (e.className.baseVal !== undefined
          ? '.' + e.className.baseVal.split(' ')[0] : '.' + String(e.className).split(' ')[0])),
        after: i > drumIdx,
        z: c.zIndex, op: c.opacity, vis: c.visibility, pos: c.position,
        bg: c.backgroundColor, blend: c.mixBlendMode,
        box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
      });
    }
    return JSON.stringify({ cx, cy, chain, covering }, null, 0);
  })()`);
  const d = JSON.parse(out);
  console.log('  鼓中心点 (' + d.cx + ', ' + d.cy + ')\n');
  console.log('  ── 鼓的祖先链（从鼓往上）──');
  d.chain.forEach((c) => console.log('    ' + c));
  console.log('\n  ── 几何上盖住这一点的元素（after=true 表示 DOM 里排在鼓后面）──');
  d.covering.forEach((c) => console.log('    ' + (c.after ? '**AFTER** ' : '   before  ') +
    c.sel.padEnd(20) + ' z=' + String(c.z).padStart(4) + ' op=' + String(c.op).padStart(5) +
    ' vis=' + String(c.vis).padEnd(9) + String(c.pos).padEnd(9) +
    ' bg=' + String(c.bg).padEnd(22) + ' blend=' + c.blend));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
