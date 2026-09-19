/* 量鼓各元素的实际渲染尺寸 —— 看为什么鼓心那么小。 */
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
const userDir = join(root, '.chrome-dmeas');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10081',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10081/json/list')).json();
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
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.value);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4000);
  await evalJs('window.scrollTo(0, 2880)');
  await sleep(2200);

  const m = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.drum');
    if (!svg) return JSON.stringify({ err: '没有鼓' });
    const sr = svg.getBoundingClientRect();
    const vb = svg.getAttribute('viewBox');
    const circles = [...svg.querySelectorAll('circle')];
    return JSON.stringify({
      svgBox: [Math.round(sr.width), Math.round(sr.height)],
      viewBox: vb,
      circles: circles.slice(0, 8).map((c, i) => {
        const r = c.getBoundingClientRect();
        return {
          i, r: c.getAttribute('r'), fill: (c.getAttribute('fill') || '').slice(0, 22),
          stroke: (c.getAttribute('stroke') || '').slice(0, 22),
          box: [Math.round(r.width), Math.round(r.height)],
          cls: c.getAttribute('class') || '',
        };
      }),
      paths: [...svg.querySelectorAll('path')].map((p) => ({
        op: p.getAttribute('opacity'), sw: p.getAttribute('stroke-width'),
        stroke: (p.getAttribute('stroke') || '').slice(0, 22),
      })),
    });
  })()`));
  console.log('\n[鼓的元素实测]');
  console.log('  svg ' + JSON.stringify(m.svgBox) + '   viewBox=' + m.viewBox);
  (m.circles || []).forEach((c) => {
    console.log('  圆#' + c.i + '  r=' + String(c.r).padStart(5) +
      '  渲染 ' + JSON.stringify(c.box).padStart(12) +
      '  fill=' + c.fill.padEnd(24) + ' stroke=' + c.stroke + '  ' + c.cls);
  });
  (m.paths || []).forEach((p, i) => {
    console.log('  弧#' + i + '  opacity=' + p.op + '  width=' + p.sw + '  stroke=' + p.stroke);
  });

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
