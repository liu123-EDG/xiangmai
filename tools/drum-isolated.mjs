/* 把概念片和 WebGL 画布全藏掉，只留鼓 ——
   如果这样鼓还是暗的，那问题就在鼓自己身上，和视频无关。 */
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
const userDir = join(root, '.chrome-isonly');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10211',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decode(png) {
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
  return { W, H, bpp, px };
}

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10211/json/list')).json();
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
  const at = (im, x, y) => {
    const i = (y * im.W + x) * im.bpp;
    return (0.2126 * im.px[i] + 0.7152 * im.px[i + 1] + 0.0722 * im.px[i + 2]) / 255;
  };
  const boxAvg = (im, x0, y0, x1, y1, step) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) { s += at(im, x, y); n++; }
    return s / Math.max(1, n);
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4400);

  console.log('\n[只留鼓 —— 视频和画布全藏掉]\n');
  await evalJs(`(() => {
    for (const el of document.querySelectorAll('.watermarks')) {
      el.style.display = 'none';
    }
    document.querySelector('.room').style.background = '#101010';
  })()`);
  await sleep(600);

  console.log('   幕        鼓面      鼓心     画面一角   鼓心/角落');
  for (const [label, act] of [['(未选)', null], ['苍劲', 0], ['叙事', 1], ['欢腾', 2]]) {
    if (act !== null) {
      await evalJs(`document.querySelectorAll('.word')[${act}].click()`);
      await sleep(2600);
    }
    const geo = JSON.parse(await evalJs(`(() => {
      const d = document.querySelector('.drum').getBoundingClientRect();
      return JSON.stringify({
        x0: Math.round(d.left), y0: Math.round(d.top),
        x1: Math.round(d.right), y1: Math.round(d.bottom),
        cx: Math.round(d.left + d.width / 2), cy: Math.round(d.top + d.height / 2),
        w: Math.round(d.width),
      });
    })()`));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const im = decode(Buffer.from(shot.result.data, 'base64'));
    const skin = boxAvg(im, geo.x0 + 55, geo.y0 + 55, geo.x1 - 55, geo.y1 - 55, 4);
    const core = boxAvg(im, geo.cx - 14, geo.cy - 14, geo.cx + 14, geo.cy + 14, 3);
    const corner = boxAvg(im, 40, 200, 300, 500, 8);
    console.log('   ' + label.padEnd(8) + skin.toFixed(4).padStart(9) +
      core.toFixed(4).padStart(10) + corner.toFixed(4).padStart(11) +
      ('  ' + (core / Math.max(0.0001, corner)).toFixed(2) + '×').padStart(10) +
      '   鼓宽 ' + geo.w);
    await writeFile(join(root, 'shots', 'isonly-' + (act === null ? 'x' : act) + '.png'),
      Buffer.from(shot.result.data, 'base64'));
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
