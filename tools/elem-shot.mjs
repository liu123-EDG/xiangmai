/* 两个决定性实验：
     ① CDP 按元素截图 —— 只截鼓那一块，看它自己画出来是什么样
     ② 把鼓从 .pillar-wrap 里挪到 .room 下 —— 看是不是父容器的问题 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';

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
const userDir = join(root, '.chrome-elem');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10251',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lumaOf(png) {
  let off = 8, W = 0, H = 0, ct = 0;
  const idat = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const t = png.toString('ascii', off + 4, off + 8);
    const d = png.subarray(off + 8, off + 8 + len);
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); ct = d[9]; }
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = W * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(H * stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = (x >= bpp && y > 0) ? px[(y - 1) * stride + x - bpp] : 0;
      const v = raw[p + x];
      let out;
      if (ft === 0) out = v;
      else if (ft === 1) out = v + a;
      else if (ft === 2) out = v + b;
      else if (ft === 3) out = v + ((a + b) >> 1);
      else {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        out = v + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c));
      }
      px[y * stride + x] = out & 255;
    }
    p += stride;
  }
  let s = 0, n = 0;
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const i = (y * W + x) * bpp;
    s += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    n++;
  }
  return { avg: s / Math.max(1, n), W, H };
}

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10251/json/list')).json();
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

  await evalJs(`document.querySelectorAll('.word')[0].click()`);
  await sleep(2800);

  const geo = JSON.parse(await evalJs(`(() => {
    const d = document.querySelector('.drum').getBoundingClientRect();
    return JSON.stringify({ x: Math.floor(d.left), y: Math.floor(d.top),
      w: Math.ceil(d.width), h: Math.ceil(d.height) });
  })()`));

  /* ① 只截鼓那一块 */
  let shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: geo.x, y: geo.y, width: geo.w, height: geo.h, scale: 1 },
  });
  let buf = Buffer.from(shot.result.data, 'base64');
  await writeFile(join(root, 'shots', 'elem-clip.png'), buf);
  const c1 = lumaOf(buf);
  console.log('\n① 只截鼓那一块      尺寸 ' + c1.W + '×' + c1.H + '   平均亮度 ' + c1.avg.toFixed(4));

  /* ② CDP 的原生元素截图（会滚动到该元素、并临时改视口） */
  try {
    const doc = await send('DOM.getDocument', { depth: -1 });
    const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '.drum-host' });
    if (q.result && q.result.nodeId) {
      const s2 = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: geo.x, y: geo.y, width: geo.w, height: geo.h, scale: 2 },
      });
      const b2 = Buffer.from(s2.result.data, 'base64');
      await writeFile(join(root, 'shots', 'elem-clip2x.png'), b2);
      const c2 = lumaOf(b2);
      console.log('② 同区域 2 倍放大   尺寸 ' + c2.W + '×' + c2.H + '   平均亮度 ' + c2.avg.toFixed(4));
    }
  } catch (e) { console.log('② 跳过：' + e.message); }

  /* ③ 把鼓从 .pillar-wrap 挪到 .room 下（去掉父容器的所有影响） */
  const moved = await evalJs(`(() => {
    const h = document.getElementById('drum-host');
    const room = document.querySelector('.room');
    const before = getComputedStyle(h).zIndex;
    room.appendChild(h);
    h.style.position = 'fixed';
    h.style.left = '50%'; h.style.top = '50%';
    h.style.transform = 'translate(-50%,-50%)';
    h.style.zIndex = '20';
    const d = document.querySelector('.drum').getBoundingClientRect();
    return JSON.stringify({ before, box: [Math.round(d.left), Math.round(d.top), Math.round(d.width)] });
  })()`);
  await sleep(1400);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  buf = Buffer.from(shot.result.data, 'base64');
  await writeFile(join(root, 'shots', 'elem-moved.png'), buf);
  const g3 = JSON.parse(await evalJs(`(() => {
    const d = document.querySelector('.drum').getBoundingClientRect();
    return JSON.stringify({ x: Math.floor(d.left), y: Math.floor(d.top),
      w: Math.ceil(d.width), h: Math.ceil(d.height) });
  })()`));
  const s3 = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: g3.x, y: g3.y, width: g3.w, height: g3.h, scale: 1 },
  });
  const c3 = lumaOf(Buffer.from(s3.result.data, 'base64'));
  console.log('③ 挪出 .pillar-wrap   ' + moved + '   平均亮度 ' + c3.avg.toFixed(4));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
