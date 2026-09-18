/* 竖屏下量文字有没有超出屏幕 —— 维吾尔文很长，窄屏容易被切。 */
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
const userDir = join(root, '.chrome-measure');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9911',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = [
  ['iPhone 竖屏', 390, 844, 3],
  ['小屏手机', 360, 640, 3],
  ['平板竖屏', 768, 1024, 2],
  ['桌面', 1600, 900, 1],
];

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9911/json/list')).json();
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

  console.log('\n[竖屏文字尺寸实测]\n');
  console.log('  尺寸          视口宽   文字宽   左溢出  右溢出   字号    字号%屏宽');

  for (const [label, w, h, dpr] of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: dpr, mobile: w < 900 });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
    await sleep(2000);
    // 拨到文字最清楚的时候
    await evalJs(`(() => { const f = window.__XM_FILM__; if (f) { f.seek(14.5); }
      if (window.__XM_PAINT__) window.__XM_PAINT__(14.5); })()`);
    await sleep(600);

    const m = JSON.parse(await evalJs(`(() => {
      const ug = document.getElementById('w-ug');
      if (!ug) return JSON.stringify({ err: '没有文字层' });
      const r = ug.getBoundingClientRect();
      const cs = getComputedStyle(ug);
      return JSON.stringify({
        w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right),
        vw: innerWidth, fs: parseFloat(cs.fontSize),
        overflowL: Math.round(Math.max(0, -r.left)),
        overflowR: Math.round(Math.max(0, r.right - innerWidth)),
        fit: getComputedStyle(document.querySelector('#hero-video video') || ug).objectFit,
      });
    })()`));
    if (m.err) { console.log('  ' + label.padEnd(12) + m.err); continue; }
    const flag = (m.overflowL > 2 || m.overflowR > 2) ? '  ← 被切！' : '';
    console.log('  ' + label.padEnd(12) + String(m.vw).padStart(6) + '  ' +
      String(m.w).padStart(7) + '  ' + String(m.overflowL).padStart(6) + '  ' +
      String(m.overflowR).padStart(6) + '  ' + String(m.fs).padStart(6) + '  ' +
      (m.fs / m.vw * 100).toFixed(1).padStart(7) + '%   ' + m.fit + flag);
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log('');
