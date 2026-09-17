/* ==========================================================================
   材质量化台
   --------------------------------------------------------------------------
   把三段材质烘焙的结果直接读回来量统计量，用来判断"材质是不是读对了"：

     mean  平均亮度   —— 三段体量关系对不对（上段最沉）
     sd    标准差     —— 有没有层次
     p01/p99  极值    —— 动态范围
     rowCorr  相邻行相关 —— 横向条纹的强度
               木纹/水波纹的病征就是这个值极高（>0.9）
               真正的"点阵"应该在低位

   用法：node tools/material-probe.mjs
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    if (file.endsWith('.html')) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body.toString().replace('</head>', '<script type="module" src="/tools/material-probe-inline.js"></script></head>'));
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9491;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePng(buf) {
  let off = 8, W = 0, H = 0, ct = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const t = buf.toString('ascii', off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
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
    const f = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + b) & 255;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 255;
      }
      cur[x] = v;
    }
  }
  return { W, H, bpp, px };
}

function stats(im, y0f, y1f) {
  const y0 = Math.round(im.H * y0f), y1 = Math.round(im.H * y1f);
  const x0 = Math.round(im.W * 0.15), x1 = Math.round(im.W * 0.85);
  const lum = (x, y) => {
    const i = (y * im.W + x) * im.bpp;
    return (0.2126 * im.px[i] + 0.7152 * im.px[i + 1] + 0.0722 * im.px[i + 2]) / 255;
  };

  let s = 0, s2 = 0, n = 0;
  const vals = [];
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const v = lum(x, y); s += v; s2 += v * v; n++; vals.push(v);
    }
  }
  const mean = s / n;
  const sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
  vals.sort((a, b) => a - b);
  const p = (q) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))];

  /* 亮区行程：木纹是长横条（横向行程远大于纵向），点阵两个方向都短且相当。
     注意两个方向必须用**同样的物理步长**，否则量出来的各向异性是采样偏差。 */
  const STEP = 2;
  const thr = mean + sd * 0.55;
  let runX = 0, cntX = 0, runY = 0, cntY = 0;
  for (let y = y0; y < y1; y += STEP) {
    let run = 0;
    for (let x = x0; x < x1; x += STEP) {
      if (lum(x, y) > thr) run++;
      else { if (run > 0) { runX += run; cntX++; } run = 0; }
    }
    if (run > 0) { runX += run; cntX++; }
  }
  for (let x = x0; x < x1; x += STEP) {
    let run = 0;
    for (let y = y0; y < y1; y += STEP) {
      if (lum(x, y) > thr) run++;
      else { if (run > 0) { runY += run; cntY++; } run = 0; }
    }
    if (run > 0) { runY += run; cntY++; }
  }
  // 换算成物理像素行程，两个方向可比
  const avgX = (runX / Math.max(1, cntX)) * STEP;
  const avgY = (runY / Math.max(1, cntY)) * STEP;

  return {
    mean, sd, p01: p(0.01), p99: p(0.99),
    runX: avgX, runY: avgY,
    // > 1 表示横向拉长（木纹/条带），≈1 表示各向同性（点阵/斑块）
    anisotropy: avgX / Math.max(1e-6, avgY),
  };
}

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
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
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.text + ' ' +
      ((m.params.exceptionDetails.exception || {}).description || ''));
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(5000);

  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__XM_PROBE__ || null)', returnByValue: true,
  });
  const raw = r.result.result.value;
  if (!raw || raw === 'null') {
    console.log('探针未就绪。控制台：');
    logs.slice(0, 6).forEach((l) => console.log('  ' + String(l).slice(0, 200)));
    fails++;
  } else {
    const imgs = JSON.parse(raw);
    const NAMES = ['穹乃额曼', '达斯坦', '麦西热甫'];
    // 房间底噪（壁面 + 壁画残片叠出来的暗部），结构柱必须明显亮于它，
    // 否则柱子会融进墙里 —— 过暗和过亮一样是错的。
    const ROOM = 0.033;

    const stats3 = imgs.map((dataUrl) => {
      const b64 = dataUrl.split(',')[1];
      return stats(decodePng(Buffer.from(b64, 'base64')), 0.1, 0.9);
    });

    console.log('\n段            均值     标准差    p01     p99    横行程  纵行程  各向异性  与房间');
    stats3.forEach((st, i) => {
      console.log(
        NAMES[i].padEnd(12) +
        st.mean.toFixed(4).padStart(7) + '  ' +
        st.sd.toFixed(4).padStart(7) + '  ' +
        st.p01.toFixed(3).padStart(5) + '  ' +
        st.p99.toFixed(3).padStart(5) + '  ' +
        st.runX.toFixed(2).padStart(6) + '  ' +
        st.runY.toFixed(2).padStart(6) + '  ' +
        st.anisotropy.toFixed(2).padStart(8) + '   ' +
        (st.mean / ROOM).toFixed(1) + '×'
      );
    });

    console.log('');
    // 1) 三段必须都明显亮于房间：柱子是主体，不能和墙一个调子
    let contrastOk = true;
    stats3.forEach((st, i) => {
      if (st.mean < ROOM * 2.2) {
        bad(NAMES[i] + ' 与房间拉不开（' + st.mean.toFixed(4) + ' vs 房间 ' + ROOM + '）');
        contrastOk = false;
      }
    });
    if (contrastOk) ok('三段都明显亮于房间（均 > 房间 2.2 倍）');

    // 2) 体量关系：穹乃额曼最沉 → 均值递增
    const [m0, m1, m2] = stats3.map((s) => s.mean);
    if (m0 < m1 && m1 <= m2) ok('体量关系正确：穹乃额曼最沉，逐段递亮');
    else bad('体量关系不对：' + [m0, m1, m2].map((v) => v.toFixed(3)).join(' / '));

    // 3) 三段性格必须真的不同，不能是三块同质色板
    if (m2 / m0 > 1.4) ok('三段明度有实差（最亮/最暗 = ' + (m2 / m0).toFixed(2) + '）');
    else bad('三段过于同质，明度比只有 ' + (m2 / m0).toFixed(2));

    // 4) 上段要有层次（最沉但不能是死板一块）
    if (stats3[0].sd > 0.015) ok('穹乃额曼有片状层次（标准差 ' + stats3[0].sd.toFixed(4) + '）');
    else bad('穹乃额曼过于平板，标准差仅 ' + stats3[0].sd.toFixed(4));

    // 5) 中段不能读成木纹：亮区若横向拉长就是年轮
    if (stats3[1].anisotropy < 2.2) ok('达斯坦未读成木纹（各向异性 ' + stats3[1].anisotropy.toFixed(2) + '）');
    else bad('达斯坦亮区横向拉长，像木纹（各向异性 ' + stats3[1].anisotropy.toFixed(2) + '）');

    // 6) 下段必须是点阵：亮区各向同性（行程 < 12 像素，两个方向接近）
    const d3 = stats3[2];
    if (d3.anisotropy < 1.6 && d3.runX < 12 && d3.runY < 12) {
      ok('麦西热甫呈点阵（各向异性 ' + d3.anisotropy.toFixed(2) +
         '，行程 ' + d3.runX.toFixed(2) + '/' + d3.runY.toFixed(2) + '）');
    } else {
      bad('麦西热甫不像点阵：各向异性 ' + d3.anisotropy.toFixed(2) +
          '，行程 ' + d3.runX.toFixed(2) + '/' + d3.runY.toFixed(2));
    }
  }
  ws.close();
} catch (e) { console.error('错误：' + e.message); fails++; }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log(fails ? '\n✗ ' + fails + ' 项未通过\n' : '\n✓ 材质统计全部达标\n');
process.exit(fails ? 1 : 0);
