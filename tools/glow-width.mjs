/* 量视频里金线的辉光带有多宽 —— 汉字要落在带外才读得清。
   做法：截一帧没有文字的纯视频画面，逐行算平均亮度，
   找出中线附近亮度高于背景的行范围。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.svg': 'image/svg+xml' };
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
const userDir = join(root, '.chrome-glow');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10031',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10031/json/list')).json();
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
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(900);

  /* 取第三段（黑场金线）的第 2.5 秒那一帧，缩到 900 高逐行量亮度。
     这是**画面本身**的亮度分布，不含任何文字。 */
  const rows = JSON.parse(await evalJs(`(async () => {
    const v = document.createElement('video');
    v.src = '/assets/video/inherit/steppe-slim.webm?x=' + Date.now();
    v.muted = true; v.playsInline = true;
    await new Promise((r) => { v.onloadeddata = r; v.onerror = () => r(); });
    await new Promise((r) => { const d = () => { v.removeEventListener('seeked', d); r(); };
      v.addEventListener('seeked', d); v.currentTime = 2.5; });
    const H = 360, W = Math.round(H * v.videoWidth / v.videoHeight);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.drawImage(v, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const out = [];
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        s += (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]) / 255;
      }
      out.push(+(s / W).toFixed(4));
    }
    return JSON.stringify({ H, W, rows: out });
  })()`, 60000));

  const { H, rows: r } = rows;
  const mid = Math.floor(H / 2);
  // 背景取上下两端的平均
  const bg = (r.slice(0, 20).concat(r.slice(H - 20))).reduce((a, b) => a + b, 0) / 40;
  const thresh = bg * 1.8 + 0.004;      // 明显高于背景才算"在光带里"

  let lo = mid, hi = mid;
  while (lo > 0 && r[lo - 1] > thresh) lo--;
  while (hi < H - 1 && r[hi + 1] > thresh) hi++;

  const toScreen = (y) => Math.round(y / H * 900);
  console.log('\n[金线辉光带测量]  按 1600×900 换算\n');
  console.log('  画面高（采样）  ' + H + '   中线 y=' + mid);
  console.log('  背景亮度        ' + bg.toFixed(4) + '   阈值 ' + thresh.toFixed(4));
  console.log('  光带范围        y ' + lo + ' – ' + hi + '  （高 ' + (hi - lo + 1) + ' 采样行）');
  console.log('  换算到 900 高    y ' + toScreen(lo) + ' – ' + toScreen(hi));
  console.log('  → 中线以下的光带一直延伸到 y=' + toScreen(hi) +
    '（中线在 y=450，即向下 ' + (toScreen(hi) - 450) + 'px）');
  console.log('  → 汉字要读得清，顶部至少要到 y=' + (toScreen(hi) + 12) + ' 以下\n');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
