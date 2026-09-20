/* 终极验证：往鼓的 SVG 里插一个纯红实心圆。
   画出来 → SVG 本身没问题，是鼓里头某个元素的问题
   不画   → 整个 .drum 这一层都没被绘制 */
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
const userDir = join(root, '.chrome-reddot');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10271',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stat2(png) {
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
  let avg = 0, maxR = 0, redPx = 0, n = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * bpp;
    avg += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    if (px[i] > 150 && px[i + 1] < 90 && px[i + 2] < 90) { redPx++; maxR = Math.max(maxR, px[i]); }
    n++;
  }
  return { avg: avg / n, redPx, maxR };
}

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10271/json/list')).json();
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
  const clipShot = async (geo, name) => {
    const s = await send('Page.captureScreenshot', {
      format: 'png', clip: { x: geo.x, y: geo.y, width: geo.w, height: geo.h, scale: 1 },
    });
    const buf = Buffer.from(s.result.data, 'base64');
    await writeFile(join(root, 'shots', name), buf);
    return stat2(buf);
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4400);

  const drumGeo = () => evalJs(`(() => {
    const d = document.querySelector('.drum').getBoundingClientRect();
    return JSON.stringify({ x: Math.floor(d.left), y: Math.floor(d.top),
      w: Math.ceil(d.width), h: Math.ceil(d.height) });
  })()`).then(JSON.parse);

  for (const [label, act] of [['(未选)', null], ['苍劲', 0], ['欢腾', 2]]) {
    if (act !== null) {
      await evalJs(`document.querySelectorAll('.word')[${act}].click()`);
      await sleep(2800);
    }
    const geo = await drumGeo();
    const before = await clipShot(geo, 'probe-' + (act === null ? 'x' : act) + '-before.png');

    /* 插一个纯红实心圆，半径和鼓面一样大 */
    await evalJs(`(() => {
      const svg = document.querySelector('.drum');
      const old = svg.querySelector('.probe-dot');
      if (old) old.remove();
      const NS = 'http://www.w3.org/2000/svg';
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'probe-dot');
      c.setAttribute('cx', '207'); c.setAttribute('cy', '207'); c.setAttribute('r', '150');
      c.setAttribute('fill', '#ff0000');
      svg.appendChild(c);
    })()`);
    await sleep(900);
    const after = await clipShot(geo, 'probe-' + (act === null ? 'x' : act) + '-after.png');
    console.log('\n── ' + label + ' ──  鼓 rect ' + JSON.stringify(geo));
    console.log('   插红圆前：平均 ' + before.avg.toFixed(4) + '  红像素 ' + before.redPx);
    console.log('   插红圆后：平均 ' + after.avg.toFixed(4) + '  红像素 ' + after.redPx);
    console.log('   → ' + (after.redPx > 50
      ? '**红圆画出来了**，SVG 这一层没问题 —— 是鼓里头元素的问题'
      : '**红圆也没画** —— 整个 .drum 层都没被绘制'));
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
