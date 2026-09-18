/* 量视频页（入口页）维语字的实际字号。
   用户说它"变成 12 了" —— 不猜，量出来看。 */
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
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
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
const userDir = join(root, '.chrome-size');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9941',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = [
  ['我的开发窗口', 1600, 900],
  ['常见笔记本', 1366, 768],
  ['小窗口', 1280, 720],
  ['很窄的窗口', 900, 700],
  ['手机竖屏', 390, 844],
];

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9941/json/list')).json();
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
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});
             Object.defineProperty(navigator,'deviceMemory',{get:()=>4});` });

  console.log('\n[视频页 · 维语字实际字号]\n');
  console.log('  窗口           视口      维语字号   占屏宽    中文      css 里写的');

  for (const [label, w, h] of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
    await sleep(2200);
    await evalJs(`(() => { const f = window.__XM_FILM__;
      if (f) f.seek(13.5);
      if (window.__XM_PAINT__) window.__XM_PAINT__(13.5); })()`);
    await sleep(500);

    const m = JSON.parse(await evalJs(`(() => {
      const ug = document.getElementById('w-ug');
      if (!ug) return JSON.stringify({ err: '这一页没有维语层（可能被降级移除了）' });
      const cn = document.querySelector('.w-title__cn');
      const cs = getComputedStyle(ug);
      const r = ug.getBoundingClientRect();
      return JSON.stringify({
        fs: parseFloat(cs.fontSize),
        vw: innerWidth, vh: innerHeight,
        vmin: Math.min(innerWidth, innerHeight),
        cnFs: cn ? parseFloat(getComputedStyle(cn).fontSize) : null,
        textW: Math.round(r.width),
        decl: cs.fontSize,
      });
    })()`));
    if (m.err) { console.log('  ' + label.padEnd(14) + m.err); continue; }
    console.log('  ' + label.padEnd(14) +
      String(m.vw + '×' + m.vh).padStart(10) + '  ' +
      String(m.fs.toFixed(1)).padStart(8) + 'px  ' +
      (m.fs / m.vw * 100).toFixed(1).padStart(6) + '%  ' +
      String(m.cnFs ? m.cnFs.toFixed(1) : '—').padStart(7) + 'px');
  }

  // 顺便看看 720 以上的页面里维语还出现在哪
  console.log('\n[其他页面上的维语元素]\n');
  for (const [path, sel] of [
    ['qiongnaieman/index.html', '.chapter-hero__ug'],
    ['index.html', '.wnode__ug'],
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${path}` });
    await sleep(2600);
    const m = JSON.parse(await evalJs(`(() => {
      const el = document.querySelector('${sel}');
      if (!el) return JSON.stringify({ err: '没有 ' + '${sel}' });
      const cs = getComputedStyle(el);
      return JSON.stringify({
        fs: cs.fontSize, display: cs.display,
        text: (el.textContent || '').trim().slice(0, 30),
      });
    })()`));
    console.log('  ' + path.padEnd(26) + sel.padEnd(20) +
      (m.err ? m.err : '字号 ' + m.fs + '   display=' + m.display + '   "' + m.text + '"'));
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log('');
