/* 从视频里抽一帧当封面图。
   为什么不用现成截图：卡片背景要跟视频同一套色调，
   从视频里取一帧最准，而且不用你再找图。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync, writeFileSync, statSync } from 'node:fs';
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
const userDir = join(root, '.chrome-frame');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'assets/img/game'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10001',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 抽哪几帧：时间点挑该段最有信息量的一刻 */
const JOBS = [
  { src: 'assets/video/inherit/gobi-slim.webm',     t: 2.4, out: 'gobi-cover.webp',   w: 1200 },
  { src: 'assets/video/inherit/qon-live-slim.webm', t: 2.6, out: 'qon-live.webp',     w: 900 },
  { src: 'assets/video/inherit/steppe-slim.webm',   t: 2.4, out: 'steppe-cover.webp', w: 1200 },
  { src: 'assets/video/inherit/tib-live-slim.webm', t: 2.6, out: 'tib-live.webp',     w: 900 },
];

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10001/json/list')).json();
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
  const evalJs = async (expr, timeoutMs = 120000) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, timeout: timeoutMs });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(800);

  console.log('\n════════ 抽封面帧 ════════\n');

  for (const j of JOBS) {
    const raw = await evalJs(`(async () => {
      const v = document.createElement('video');
      v.src = '/' + ${JSON.stringify(j.src)} + '?t=' + Date.now();
      v.muted = true; v.playsInline = true;
      await new Promise((r) => { v.onloadeddata = r; v.onerror = () => r(); });
      if (!v.videoWidth) return JSON.stringify({ err: '解码失败' });
      await new Promise((r) => {
        const done = () => { v.removeEventListener('seeked', done); r(); };
        v.addEventListener('seeked', done);
        v.currentTime = ${j.t};
      });
      const W = ${j.w};
      const H = Math.round(W * v.videoHeight / v.videoWidth);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      cv.getContext('2d').drawImage(v, 0, 0, W, H);
      return JSON.stringify({
        data: cv.toDataURL('image/jpeg', 0.82),
        w: W, h: H, inW: v.videoWidth, inH: v.videoHeight,
      });
    })()`, 120000);

    const r = JSON.parse(raw);
    if (r.err) { console.log('  ' + j.out + ' 失败：' + r.err); continue; }
    const b64 = r.data.split(',')[1];
    const out = join(root, 'assets/img/game', j.out);
    writeFileSync(out, Buffer.from(b64, 'base64'));
    const kb = Math.round(statSync(out).size / 1024);
    console.log('  ' + j.out.padEnd(20) + String(kb).padStart(5) + ' KB   ' +
      r.inW + '×' + r.inH + ' → ' + r.w + '×' + r.h + '   （取 ' + j.t + 's 那一帧）');
  }

  ws.close();
} catch (e) { console.error('\n错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
