/* ==========================================================================
   弦脉 —— 浏览器自检
   用 Chrome DevTools Protocol 驱动真实 Chrome：
     · 确认 WebGL 着色器在真实驱动上编译通过
     · 抓控制台/页面错误
     · 按滚动进度截图（首屏四态 + 传承网络）
   零依赖：Node 内置 WebSocket + fetch，静态服务与 CDP 客户端都在本文件里。
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync as readFileSyncSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

/* 解析 PNG（8bit、非隔行、RGB/RGBA），用于在真实截图上读像素 */
function decodePng(file) {
  const buf = readFileSyncSync(file);
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = join(root, 'shots');

/* ------------------------------------------------------------------ 找浏览器 */
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  process.env.LOCALAPPDATA + '/Google/Chrome/Application/chrome.exe',
];
const browserPath = BROWSERS.find((p) => p && existsSync(p));
if (!browserPath) { console.error('未找到 Chrome / Edge'); process.exit(2); }

/* ------------------------------------------------------------------ 静态服务 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    if (url.searchParams.get('selftest') === '1' && !p.endsWith('.js')) {
      // 注入画布尺寸探针，供截图前的等待条件使用
      const tpl = await readFile(join(root, p), 'utf8');
      const probe = '<script>window.__XM=window.__XM||{};(function tick(){var c=document.getElementById("gl");if(c&&c.width>1){window.__XM.canvas=1;}else{requestAnimationFrame(tick);}})();</script>';
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/html' });
      res.end(tpl.replace('</head>', probe + '</head>'));
      return;
    }
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('404');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/index.html?selftest=1`;

/* ------------------------------------------------------------------ CDP 客户端 */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    const cli = {
      events: [],
      send(method, params = {}, sessionId) {
        const mid = ++id;
        return new Promise((res, rej) => {
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      },
      on(fn) { listeners.push(fn); },
      close() { try { ws.close(); } catch {} },
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method) {
        cli.events.push(msg);
        listeners.forEach((fn) => fn(msg));
      }
    };
    ws.onerror = (e) => reject(new Error('ws error ' + (e.message || '')));
    ws.onopen = () => resolve(cli);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTarget(port, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('等待 DevTools 目标超时');
}

/* ------------------------------------------------------------------ 启动 */
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
await mkdir(shotsDir, { recursive: true });

const debugPort = 9333;
const chrome = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  '--force-device-scale-factor=2',
  '--enable-unsafe-swiftshader',
  '--use-angle=default',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  const target = await waitForTarget(debugPort);
  const cdp = await connect(target.webSocketDebuggerUrl);

  const errors = [];
  cdp.on((msg) => {
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') errors.push('[' + e.level + '] ' + e.text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('[exception] ' + (d.exception && d.exception.description || d.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('[console.error] ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 2, mobile: false,
  });

  console.log('\n[浏览器自检] ' + browserPath.split('/').pop());

  /* ---------- 载入 ---------- */
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(2600);

  const evalJs = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr);
    return r.result.value;
  };

  /* ---------- 1. 渲染后端 ---------- */
  console.log('\n[1] 渲染后端与着色器编译');
  const render = await evalJs('document.body.dataset.render');
  const renderErr = await evalJs('(window.__XM && window.__XM.renderError) || null');
  const diag = await evalJs(`(() => {
    const c = document.getElementById('gl');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { webgl: false };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      webgl: true,
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      canvas: c.width + 'x' + c.height,
      err: gl.getError(),
    };
  })()`);

  // textured = 着色器编译通过且三段材质已烘焙成纹理；webgl = 只跑通了空气层
  if (render === 'textured' || render === 'webgl') {
    ok('渲染后端 = ' + render + '（着色器在真实驱动上编译通过' +
       (render === 'textured' ? '，三段材质已烘焙' : '') + '）');
  } else {
    bad('渲染后端 = ' + render);
    if (renderErr) console.log('       原因：' + String(renderErr).slice(0, 400));
  }

  if (diag.webgl) {
    ok('上下文 ' + diag.version + ' / 画布 ' + diag.canvas);
    console.log('       renderer: ' + String(diag.renderer).slice(0, 90));
    if (diag.err === 0) ok('gl.getError() = 0');
    else bad('gl.getError() = ' + diag.err);
  }

  /* ---------- 2. 画面确实在动 ---------- */
  console.log('\n[2] 画面活动性与几何对齐');
  const shotA = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await sleep(700);
  const shotB = await cdp.send('Page.captureScreenshot', { format: 'png' });
  if (shotA.data !== shotB.data) ok('两帧截图不同 → 实时渲染中（呼吸/尘埃在动）');
  else bad('两帧截图完全一致 → 画面是静止的');

  /* ---------- 2b. 坐标与纹理 -----------------
     直接量 DOM：几何归布局引擎管，所以这里查的是"材质有没有铺上去、
     尺寸有没有被拉伸"。 */
  const sz = await evalJs(`(() => {
    const c = document.getElementById('gl');
    const b = c.getBoundingClientRect();
    const pillar = document.getElementById('pillar').getBoundingClientRect();
    const segs = [...document.querySelectorAll('.seg')].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        hasTex: el.classList.contains('has-tex'),
        lit: el.classList.contains('is-lit'),
        active: el.classList.contains('is-active'),
        size: [Math.round(r.width), Math.round(r.height)],
        bg: (cs.backgroundImage || '').slice(0, 24),
      };
    });
    return JSON.stringify({
      render: document.body.dataset.render,
      canvasAttr: [c.width, c.height],
      canvasCss: [Math.round(b.width), Math.round(b.height)],
      bufferRatio: +(c.width / Math.max(1, b.width)).toFixed(4),
      inner: [innerWidth, innerHeight],
      pillar: [Math.round(pillar.left), Math.round(pillar.top),
               Math.round(pillar.width), Math.round(pillar.height)],
      segs,
    });
  })()`);
  const S = JSON.parse(sz);
  console.log('       画布属性=' + S.canvasAttr + '  CSS=' + S.canvasCss + '  比例=' + S.bufferRatio);
  console.log('       柱体 rect=[' + S.pillar + ']');
  if (S.canvasCss[0] === S.inner[0] && S.canvasCss[1] === S.inner[1]) ok('画布铺满视口（布局盒 = 视口）');
  else bad('画布尺寸与视口不符：' + S.canvasCss + ' vs ' + S.inner);
  const ratioWant = S.canvasAttr[0] / S.canvasCss[0];
  if (Math.abs(S.bufferRatio - ratioWant) < 0.01) ok('后备缓冲比例自洽（' + S.bufferRatio + '）');
  else bad('后备缓冲比例异常：' + S.bufferRatio + '，应为 ' + ratioWant.toFixed(4));
  const expectX = (S.inner[0] - S.pillar[2]) / 2;
  if (Math.abs(S.pillar[0] - expectX) < 2) ok('结构柱横向居中（x=' + S.pillar[0] + '）');
  else bad('结构柱未居中：x=' + S.pillar[0] + '，应为 ' + Math.round(expectX));

  const texCount = S.segs.filter((s) => s.hasTex).length;
  if (texCount === 3) ok('三段材质均已烘焙并铺到 DOM（程序化纹理，非手绘）');
  else bad('只有 ' + texCount + ' 段拿到烘焙材质');
  // 纹理不该被拉伸：DOM 段与烘焙纹理的宽高比要对得上（设计比例见 app.js 的 sizes）
  const BAKE = [[1024, 428], [1024, 317], [1024, 352]];
  let ratioOk = true;
  S.segs.forEach((s, i) => {
    const domR = s.size[0] / Math.max(1, s.size[1]);
    const texR = BAKE[i][0] / BAKE[i][1];
    const dev = Math.abs(domR - texR) / texR;
    console.log('       第' + (i + 1) + '段 DOM ' + s.size.join('×') + '（比 ' + domR.toFixed(2) +
                '）  烘焙 ' + BAKE[i].join('×') + '（比 ' + texR.toFixed(2) +
                '）  偏差 ' + (dev * 100).toFixed(1) + '%');
    if (dev > 0.12) ratioOk = false;
  });
  if (ratioOk) ok('三段纹理与 DOM 宽高比一致，贴图不会被拉伸');
  else bad('纹理与 DOM 宽高比偏差过大，画面会被拉伸');

  /* 画面健康度：三段平均亮度必须有实差，且不能整屏死黑 */
  const bandLum = await evalJs(`(() => {
    const r = window.__XM && window.__XM.measurePillar;
    const s = r ? r(true) : null;
    return s && s.bands ? s.bands : null;
  })()`);
  if (bandLum) {
    const [b1, b2, b3] = bandLum;
    console.log('       三段平均亮度  上=' + b1 + '  中=' + b2 + '  下=' + b3);
    if (Math.max(b1, b2, b3) > 0.02) ok('画面成片发亮，结构柱可见');
    else bad('整屏接近死黑，柱体几乎没有亮度');
    if (Math.max(b1, b2, b3) / Math.max(0.0001, Math.min(b1, b2, b3)) > 1.08) ok('三段亮度有实差，性格差异落在画面上');
    else bad('三段亮度几乎一致，缺乏结构差异');
  }

  /* 亮度图：走真实截图，而不是画布直读。
     WebGL 画布不保留绘制缓冲，直读那条路在部分环境会拿到清空后的内容。 */
  const asciiShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(shotsDir, '_ascii.png'), Buffer.from(asciiShot.data, 'base64'));
  const asciiIm = decodePng(join(shotsDir, '_ascii.png'));
  const chars = ' .:-=+*#%@';
  const rows = [];
  for (let ry = 0; ry < 24; ry++) {
    let line = '';
    for (let rx = 0; rx < 120; rx++) {
      const x = Math.min(asciiIm.W - 1, Math.round((rx / 120) * asciiIm.W));
      const y = Math.min(asciiIm.H - 1, Math.round((ry / 24) * asciiIm.H));
      const i = (y * asciiIm.W + x) * asciiIm.bpp;
      const l = (0.2126 * asciiIm.px[i] + 0.7152 * asciiIm.px[i + 1] + 0.0722 * asciiIm.px[i + 2]) / 255;
      line += chars[Math.min(9, Math.floor(Math.pow(l, 0.42) * 12))];
    }
    rows.push(line);
  }
  console.log('\n   ── 首屏亮度图（真实截图）' + '─'.repeat(39));
  rows.forEach((l) => console.log('   |' + l + '|'));
  console.log('   ' + '─'.repeat(62) + '\n');
  if (rows.join('').replace(/[ |]/g, '').length > 60) ok('画面有内容（亮度图非空）');
  else bad('亮度图几乎全黑，画面可能没画出来');

  /* 房间照度与柱体定位：同样只用截图 */
  const exposure = (() => {
    const im = asciiIm;
    const lum = (cx, cy) => {
      const x = Math.min(im.W - 1, Math.round(cx * im.W / 1440));
      const y = Math.min(im.H - 1, Math.round(cy * im.H / 900));
      const i = (y * im.W + x) * im.bpp;
      return (0.2126 * im.px[i] + 0.7152 * im.px[i + 1] + 0.0722 * im.px[i + 2]) / 255;
    };
    let room = 0, n = 0;
    for (let y = 300; y < 640; y += 20) for (let x = 60; x < 330; x += 20) { room += lum(x, y); n++; }
    room /= Math.max(1, n);
    let pil = 0, m = 0;
    for (let y = 230; y < 690; y += 20) { pil += lum(720, y); m++; }
    pil /= Math.max(1, m);

    // 柱体横向范围：亮度显著高于房间的连续列
    const y0 = Math.round(im.H * 0.30), y1 = Math.round(im.H * 0.70);
    const cut = room + 0.05;
    let bl = -1, br = -1;
    for (let x = 0; x < im.W; x++) {
      let c = 0, t = 0;
      for (let y = y0; y < y1; y += 4) {
        t++;
        const i = (y * im.W + x) * im.bpp;
        if ((0.2126 * im.px[i] + 0.7152 * im.px[i + 1] + 0.0722 * im.px[i + 2]) / 255 > cut) c++;
      }
      if (c / t > 0.45) { if (bl < 0) bl = x; br = x; }
    }
    const sc = im.W / 1440;
    return { room, pil, left: bl / sc, right: br / sc };
  })();

  console.log('       房间底噪=' + exposure.room.toFixed(4) + '  柱体亮度=' + exposure.pil.toFixed(4));
  if (exposure.room < 0.055) ok('柱体之外的房间是真的暗（底噪 ' + exposure.room.toFixed(4) + '）');
  else bad('房间发灰，底噪 ' + exposure.room.toFixed(4) + ' 过高，"极暗房间"未成立');
  if (exposure.pil - exposure.room > 0.05) ok('柱体明显亮于房间（差 ' + (exposure.pil - exposure.room).toFixed(4) + '）');
  else bad('柱体与房间没有拉开差别（差 ' + (exposure.pil - exposure.room).toFixed(4) + '）');

  console.log('       截图里柱体横向 = [' + exposure.left.toFixed(0) + ', ' + exposure.right.toFixed(0) + ']  期望 [440, 1000]');
  if (exposure.left >= 0 && Math.abs(exposure.left - 440) < 30 && Math.abs(exposure.right - 1000) < 40) {
    ok('渲染柱体与 DOM 位置一致（真实截图对账）');
  } else {
    bad('渲染柱体与 DOM 位置不符：Δ左=' + (exposure.left - 440).toFixed(0) + 'px Δ右=' + (exposure.right - 1000).toFixed(0) + 'px');
  }

  /* 分幕导航：用户报过"点下一幕没反应"。
     这里真的点一下，看 state 是否推进 —— 这是纯 DOM 交互，不需要滚动。 */
  console.log('\n[2c] 分幕导航');
  await evalJs('window.scrollTo(0,0)');
  await sleep(900);
  const navBefore = JSON.parse(await evalJs(`JSON.stringify({
    prevDisabled: document.getElementById('act-prev').disabled,
    nextLabel: document.getElementById('act-next-label').textContent,
    dot: document.querySelector('#act-dots button[aria-current="true"]').getAttribute('aria-label'),
  })`));
  console.log('       点击前 ' + JSON.stringify(navBefore));
  if (navBefore.prevDisabled) ok('第一幕时"上一幕"已禁用（不会点了没反应）');
  else bad('第一幕时"上一幕"未禁用');

  await evalJs(`document.getElementById('act-next').click()`);
  await sleep(2200);
  const navAfter = JSON.parse(await evalJs(`JSON.stringify({
    stage: document.body.dataset.stage,
    nextLabel: document.getElementById('act-next-label').textContent,
    dot: document.querySelector('#act-dots button[aria-current="true"]').getAttribute('aria-label'),
  })`));
  console.log('       点击后 ' + JSON.stringify(navAfter));
  if (Number(navAfter.stage) >= 1) ok('点「下一幕」真的推进到 stage=' + navAfter.stage);
  else bad('点「下一幕」没有推进，stage=' + navAfter.stage);
  if (navAfter.dot !== navBefore.dot) ok('刻度点跟随更新：' + navAfter.dot);
  else bad('刻度点没有更新');

  // 连点到底，最后一幕的按钮应变成跨页入口。
  // 注意：真点到"进入第二章"会导航离开当前页，所以这里只连点两次到第 3 幕，
  // 再单独检查第 4 幕的按钮文案 —— 不触发跳转。
  for (let i = 0; i < 2; i++) {
    await evalJs(`document.getElementById('act-next').click()`);
    await sleep(1900);
  }
  const last = JSON.parse(await evalJs(`JSON.stringify({
    stage: document.body.dataset.stage,
    label: document.getElementById('act-next-label').textContent,
    isFinal: document.getElementById('act-next').classList.contains('is-final'),
    prevDisabled: document.getElementById('act-prev').disabled,
  })`));
  console.log('       走到第 3 幕 ' + JSON.stringify(last));
  if (Number(last.stage) >= 2 && !last.prevDisabled) {
    ok('逐幕推进可用，已到 stage=' + last.stage + '，且「上一幕」已启用');
  } else {
    bad('逐幕推进异常：' + JSON.stringify(last));
  }

  // 上一幕也要能回
  await evalJs(`document.getElementById('act-prev').click()`);
  await sleep(1900);
  const backStage = await evalJs('document.body.dataset.stage');
  if (Number(backStage) < Number(last.stage)) ok('点「上一幕」可回退到 stage=' + backStage);
  else bad('「上一幕」没有回退：' + backStage);

  await evalJs('window.scrollTo(0,0)');
  await sleep(800);

  /* ---------- 3. 分态截图 ---------- */
  console.log('\n[3] 分态截图');
  const bandSeries = [];   // 每次记录三段各自的平均亮度，用来验证"逐段点亮"
  const bandAvg = (im, top, bottom) => {
    let s = 0, n = 0;
    for (let cy = top; cy < bottom; cy += 12) {
      for (let cx = 470; cx < 970; cx += 12) {
        const x = Math.min(im.W - 1, Math.round(cx * im.W / 1440));
        const y = Math.min(im.H - 1, Math.round(cy * im.H / 900));
        const i = (y * im.W + x) * im.bpp;
        s += (0.2126 * im.px[i] + 0.7152 * im.px[i + 1] + 0.0722 * im.px[i + 2]) / 255;
        n++;
      }
    }
    return +(s / Math.max(1, n)).toFixed(4);
  };
  const go = async (progress, name) => {
    await evalJs(`(() => {
      const hero = document.getElementById('hero');
      const d = Math.max(1, hero.offsetHeight - innerHeight);
      scrollTo(0, hero.offsetTop + d * ${progress} + 2);
    })()`);
    await sleep(2600); // 等点亮缓动与关键字浮现走完
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(shotsDir, name + '.png'), Buffer.from(shot.data, 'base64'));
    const st = await evalJs('document.body.dataset.stage');
    const shown = await evalJs(`[...document.querySelectorAll('.word')].filter(w=>w.classList.contains('is-shown')).map(w=>w.textContent).join('')`);
    const fig = await evalJs(`document.getElementById('figure-num').textContent`);
    const entryVis = await evalJs(`getComputedStyle(document.querySelector('.entry')).visibility`);
    const im = decodePng(join(shotsDir, name + '.png'));
    // 三段在柱体里的纵向分界（柱体 y 从 159 到 759）
    const bands = [bandAvg(im, 175, 385), bandAvg(im, 400, 555), bandAvg(im, 570, 745)];
    bandSeries.push({ name, st, bands });
    console.log('       ' + name + '.png  stage=' + st + ' 关键字="' + shown + '" 坐标=' + fig +
                ' 入口=' + entryVis + ' 三段亮度=' + JSON.stringify(bands));
    return { st, shown, fig, entryVis };
  };

  const s0 = await go(0.02, '01-hero-top');
  if (s0.st === '0') ok('初始态 stage=0（未点亮，只有引导句）');
  else bad('初始态 stage=' + s0.st);

  const s1 = await go(0.20, '02-qon');
  if (s1.st === '1' && s1.shown === '苍劲') ok('滚到第一段：点亮「苍劲」');
  else bad('第一段状态错误 stage=' + s1.st + ' 关键字=' + s1.shown);

  const s2 = await go(0.60, '03-dastan');
  if (s2.st === '2' && s2.shown === '叙事') ok('滚到第二段：点亮「叙事」');
  else bad('第二段状态错误 stage=' + s2.st + ' 关键字=' + s2.shown);

  const s3 = await go(0.99, '04-mashrap-entry');
  if (s3.st === '3' && s3.shown === '欢腾') ok('滚到底部：点亮「欢腾」');
  else bad('底部状态错误 stage=' + s3.st + ' 关键字=' + s3.shown);
  if (s3.entryVis === 'visible') ok('入口句浮现可见');
  else bad('入口句不可见：' + s3.entryVis);

  /* 逐段点亮必须是"真的亮起来"：比较同一段在不同阶段的亮度 */
  console.log('       逐段点亮对比：');
  const byStage = {};
  bandSeries.forEach((b) => { byStage[b.st] = b.bands; });
  let litOk = true;
  for (let bi = 0; bi < 3; bi++) {
    const atLit = byStage[String(bi + 1)] ? byStage[String(bi + 1)][bi] : null;
    const before = bi === 0 ? (byStage['0'] ? byStage['0'][bi] : null) : (byStage[String(bi)] ? byStage[String(bi)][bi] : null);
    if (atLit == null || before == null) { litOk = false; continue; }
    const gain = atLit - before;
    console.log('         第' + (bi + 1) + '段：点亮前 ' + before + ' → 点亮后 ' + atLit +
                '（+' + gain.toFixed(4) + '）');
    if (gain <= 0.004) litOk = false;
  }
  if (litOk) ok('滚动确实把每一段依次点亮（三段亮度都上升）');
  else bad('某一段点亮前后亮度没有上升，"逐段点亮"未生效');

  /* ---------- 4. 传承网络 ---------- */
  console.log('\n[4] 传承网络交互');
  await evalJs(`document.getElementById('entry-btn').click()`);
  await sleep(2400);
  const netState = await evalJs(`(() => ({
    open: document.body.classList.contains('is-network'),
    roots: document.querySelectorAll('.node--root').length,
    satellites: document.querySelectorAll('.node--satellite').length,
    step: document.getElementById('network-step').textContent,
  }))()`);
  if (netState.open && netState.roots === 12) ok('网络展开：主干 ' + netState.roots + ' 位、支系 ' + netState.satellites + ' 个');
  else bad('网络展开异常：' + JSON.stringify(netState));

  // 点两个点，画一条线
  await evalJs(`document.querySelector('.node--root').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  await sleep(900);
  const afterSource = await evalJs(`document.getElementById('network-step').textContent`);
  await evalJs(`document.querySelector('.node--satellite').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  await sleep(1200);
  const afterLink = await evalJs(`({links: document.querySelectorAll('.link').length, step: document.getElementById('network-step').textContent})`);
  if (afterLink.links === 1) ok('点两个点 → 画出 ' + afterLink.links + ' 条传承线（' + afterSource.slice(0, 12) + '…）');
  else bad('连线失败：' + JSON.stringify(afterLink));

  const shotNet = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(shotsDir, '05-network.png'), Buffer.from(shotNet.data, 'base64'));
  console.log('       05-network.png');

  /* ---------- 5. 移动端 ---------- */
  console.log('\n[5] 移动端布局');
  await evalJs(`document.getElementById('network-close').click()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await evalJs('scrollTo(0,0)');
  await sleep(2000);
  const mobile = await evalJs(`(() => {
    const r = document.getElementById('pillar-wrap').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), overflowX: document.documentElement.scrollWidth > innerWidth + 1, render: document.body.dataset.render };
  })()`);
  if (!mobile.overflowX) ok('390×844 无横向溢出，柱体 ' + mobile.w + '×' + mobile.h);
  else bad('移动端出现横向溢出');
  const shotM = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(shotsDir, '06-mobile.png'), Buffer.from(shotM.data, 'base64'));
  console.log('       06-mobile.png');

  /* ---------- 6. 错误汇总 ---------- */
  console.log('\n[6] 控制台');
  const real = errors.filter((e) => !/favicon|DevTools|Autofill/i.test(e));
  if (real.length === 0) ok('无错误、无警告');
  else real.slice(0, 12).forEach((e) => bad(e.slice(0, 180)));
  if (errors.length !== real.length) ok('忽略的条目：favicon 404（无图标文件，非缺陷）');

  /* ---------- 7. file:// 直开 ----------
     这一项必须单独测：本地服务器能跑通，不代表双击能跑通。
     file:// 下 type="module" 会被 CORS 拦掉，页面会完全失去交互与材质。
     宁可在这里红，也不要让用户双击后看到三个色块。 */
  console.log('\n[7] file:// 直开（双击打开的场景）');
  const fileErrCount = errors.length;
  await cdp.send('Page.navigate', {
    url: 'file:///' + join(root, 'index.html').replace(/\\/g, '/'),
  });
  await sleep(4500);
  const fsRaw = await evalJs(`(() => {
    const c = document.getElementById('gl');
    return JSON.stringify({
      render: document.body.dataset.render,
      ready: document.body.classList.contains('is-ready'),
      hasTex: document.querySelectorAll('.seg.has-tex').length,
      canvasAttr: [c.width, c.height],
    });
  })()`);
  console.log('       ' + fsRaw);
  const FS = JSON.parse(fsRaw);
  if (FS.render === 'pending' || !FS.ready) bad('file:// 下脚本没执行（module 是否被 CORS 拦掉？）');
  else ok('file:// 下脚本正常执行（render=' + FS.render + '）');
  if (FS.hasTex === 3) ok('file:// 下三段材质烘焙成功');
  else bad('file:// 下只有 ' + FS.hasTex + ' 段烘焙成功');
  if (FS.canvasAttr[0] > 300) ok('file:// 下渲染画布已按视口建立');
  else bad('file:// 下画布仍是默认尺寸 ' + FS.canvasAttr);
  const fileErrs = errors.slice(fileErrCount).filter((e) => !/favicon/i.test(e));
  if (fileErrs.length === 0) ok('file:// 下无控制台错误');
  else fileErrs.slice(0, 4).forEach((e) => bad('file:// ' + e.slice(0, 160)));

  cdp.close();
} catch (err) {
  bad('自检中断：' + err.message);
} finally {
  chrome.kill();
  server.close();
  await sleep(300);
}

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 浏览器自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
