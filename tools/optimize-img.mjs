/* ==========================================================================
   图片优化：PNG/JPG → WebP
   --------------------------------------------------------------------------
   AI 出的图动辄 2~4 MB，手机上加载很慢。转成 WebP 通常只剩 1/5，肉眼看不出差别。

   为什么用浏览器转：机器上没有 ImageMagick / ffmpeg / cwebp，
   但 Chrome 的 canvas 编码器就是现成的、质量最好的那一个。

   用法：
     node tools/optimize-img.mjs                    # 处理 assets/img 下所有 png/jpg
     node tools/optimize-img.mjs <文件或目录> …      # 指定目标
     node tools/optimize-img.mjs --max 1920 --quality 84
   原图不会被删除，WebP 写在旁边。页面里把 src 的后缀改成 .webp 即可。
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename, relative } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- 参数 ---- */
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const MAX = flag('max', 1920);
const QUALITY = flag('quality', 82);
const targets = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg']);

async function walk(p, out = []) {
  const st = await stat(p);
  if (st.isFile()) {
    if (IMG_EXT.has(extname(p).toLowerCase())) out.push(p);
    return out;
  }
  for (const name of await readdir(p)) {
    if (name.startsWith('.')) continue;
    await walk(join(p, name), out);
  }
  return out;
}

let files = [];
for (const t of (targets.length ? targets : ['assets/img'])) {
  const abs = join(root, t);
  if (!existsSync(abs)) { console.log('跳过（不存在）：' + t); continue; }
  files = files.concat(await walk(abs));
}

if (!files.length) {
  console.log('\n没有找到可处理的图片（支持 .png / .jpg / .jpeg）\n');
  process.exit(0);
}

/* ---- 起一个临时服务器给浏览器取图 ---- */
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).slice(1);
    if (p === '__page') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><meta charset="utf-8"><title>opt</title><body></body>');
      return;
    }
    const body = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
if (!chromePath) { console.log('找不到 Chrome / Edge，无法转换'); process.exit(1); }

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9621;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
  '--window-size=1600,1200', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n[图片优化]  最长边 ' + MAX + 'px  质量 ' + QUALITY + '\n');

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json();
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
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/__page` });
  await sleep(600);

  let savedTotal = 0, done = 0;

  for (const abs of files) {
    const rel = relative(root, abs).replace(/\\/g, '/');
    const srcBytes = (await stat(abs)).size;

    const dataUrl = await evalJs(`(async () => {
      const img = new Image();
      img.src = '/${rel}?t=' + Date.now();
      await img.decode();
      const scale = Math.min(1, ${MAX} / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      return JSON.stringify({ url: c.toDataURL('image/webp', ${QUALITY}), w, h,
                              nw: img.naturalWidth, nh: img.naturalHeight });
    })()`);

    const info = JSON.parse(dataUrl);
    const b64 = info.url.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    const outAbs = join(dirname(abs), basename(abs, extname(abs)) + '.webp');
    await writeFile(outAbs, buf);

    const pct = Math.round((1 - buf.length / srcBytes) * 100);
    savedTotal += srcBytes - buf.length;
    done++;
    console.log('  ✓ ' + rel);
    console.log('      ' + info.nw + '×' + info.nh + ' → ' + info.w + '×' + info.h +
      '   ' + (srcBytes / 1024).toFixed(0) + ' KB → ' + (buf.length / 1024).toFixed(0) +
      ' KB   省 ' + pct + '%');
    console.log('      ' + relative(root, outAbs).replace(/\\/g, '/'));
  }

  console.log('\n  共 ' + done + ' 张，合计省下 ' + (savedTotal / 1024 / 1024).toFixed(2) + ' MB');
  console.log('  页面里把图片后缀改成 .webp 即可；原图保留，确认无误后可自行删除。\n');

  ws.close();
} finally {
  chrome.kill(); server.close(); await sleep(200);
}
