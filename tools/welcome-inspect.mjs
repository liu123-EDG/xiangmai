/* 入口页：品牌与「进入」到底有没有渲染出来。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-wi');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });

/* 用用户的实际方式打开：**不加 autoplay 覆盖**，走 file:// */
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9831',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9831/json/list')).json();
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
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///D:/dsh/xiangmai/welcome/index.html' });
  await sleep(6000);

  const rep = await evalJs(`(() => {
    const q = (s) => document.querySelector(s);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        op: +(+cs.opacity).toFixed(3),
        vis: cs.visibility,
        disp: cs.display,
        z: cs.zIndex,
        pos: cs.position,
        color: cs.color,
        fs: cs.fontSize,
      };
    };
    const host = q('#hero-video');
    return JSON.stringify({
      html: { scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight },
      bodyH: document.body.scrollHeight,
      stage: box(q('#stage')),
      entry: box(q('.w-wrap')),
      brand: box(q('.w-brand')),
      brandName: box(q('.w-brand__name')),
      foot: box(q('.w-foot')),
      go: box(q('.w-go')),
      goText: q('.w-go') ? q('.w-go').textContent.trim().replace(/\\s+/g, ' ') : null,
      scrim: box(q('.w-scrim')),
      wait: box(q('.w-wait')),
      hostRemoved: !host,
      hostBox: box(host),
      videoControls: host ? [...host.querySelectorAll('video')].length : 0,
      animations: [...document.querySelectorAll('.w-brand,.w-foot')].map((el) =>
        (el.getAnimations ? el.getAnimations().map((a) => (a.animationName || '?') + ':' + a.playState) : [])),
    }, null, 1);
  })()`);
  console.log('\n[入口页元素实测 — file:// 打开]\n' + rep);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome-file.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('\n  截图 shots/welcome-file.png');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
