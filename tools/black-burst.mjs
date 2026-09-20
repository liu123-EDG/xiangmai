/* 同一位置连拍多张 —— 判断"黑屏"是真的黑，还是概念片正好播到黑色那一段。
   概念片有三段：01 壁画 / 02 流沙 / 03 黑场（本身就是全黑）。
   只拍一张很容易抓到 03，看着就像坏了。 */
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
const userDir = join(root, '.chrome-burst');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10191',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 解析 PNG 并算平均亮度（只取中心区域，避开顶栏和文字） */
function luma(png) {
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
  // 中心区域（避开顶栏、右下导航、底部入口句）
  let s = 0, n = 0;
  for (let y = Math.round(H * 0.10); y < Math.round(H * 0.80); y += 6) {
    for (let x = Math.round(W * 0.05); x < Math.round(W * 0.95); x += 6) {
      const i = (y * W + x) * bpp;
      s += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      n++;
    }
  }
  return s / Math.max(1, n);
}

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10191/json/list')).json();
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

  for (const [label, act] of [['第一幕 苍劲', 0], ['第二幕 叙事', 1], ['第三幕 欢腾', 2]]) {
    await evalJs(`document.querySelectorAll('.word')[${act}].click()`);
    await sleep(2600);
    console.log('\n── ' + label + ' ──');
    const vals = [];
    for (let k = 0; k < 8; k++) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shot.result.data, 'base64');
      const L = luma(buf);
      const clip = await evalJs(`(() => {
        const on = [...document.querySelectorAll('#hero-video video')]
          .findIndex((v) => +getComputedStyle(v).opacity > 0.5);
        return JSON.stringify({ clip: on, op: +(+getComputedStyle(document.getElementById('hero-video')).opacity).toFixed(2) });
      })()`);
      vals.push(L);
      process.stdout.write('  第' + (k + 1) + '张 亮度 ' + L.toFixed(4) + '  ' + clip + '\n');
      if (k === 0) {
        await writeFile(join(root, 'shots', 'burst-' + act + '.png'), buf);
      }
      await sleep(1400);
    }
    const mn = Math.min(...vals), mx = Math.max(...vals);
    console.log('   亮度范围 ' + mn.toFixed(4) + ' ~ ' + mx.toFixed(4) +
      (mn < 0.012 && mx > 0.03 ? '   ← **会周期性地全黑**（概念片播到黑场那一段）' : ''));
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
