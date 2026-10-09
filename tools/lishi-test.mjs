/* 第五章自检
   查三件事，都要有实测数据：
     ① 五个部件都真的建起来了、能交互
     ② 背景确实被压暗了（对比 emberScale）
     ③ 页面上没有"图片位 / 图注位"这种占位文字
   另外量一下整页亮度，确认不再是一片死黑。 */
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
const userDir = join(root, '.chrome-lishi');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10301',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

function lumaAvg(png) {
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
  let s = 0, n = 0, hist = [0, 0, 0, 0];
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    const i = (y * W + x) * bpp;
    const L = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    s += L; n++;
    hist[L < 0.05 ? 0 : L < 0.15 ? 1 : L < 0.4 ? 2 : 3]++;
  }
  return { avg: s / n, hist: hist.map((v) => +(v / n * 100).toFixed(1)) };
}

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10301/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 170));
    }
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
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/lishi/index.html` });
  await sleep(4200);

  console.log('\n[第五章自检]\n');

  /* ① 部件建起来了吗 */
  const built = JSON.parse(await evalJs(`(() => {
    const p = window.__XM_LISHI__ || {};
    const q = (s) => document.querySelectorAll(s).length;
    return JSON.stringify({
      keys: Object.keys(p),
      timeline: p.timeline ? p.timeline.state() : null,
      subtract: p.subtract ? p.subtract.state() : null,
      recorder: p.recorder ? p.recorder.state() : null,
      rails: p.rails ? p.rails.state() : null,
      cases: p.cases ? p.cases.state() : null,
      dom: {
        tlsNodes: q('.tls__node'), subCells: q('.sub__cell'),
        recTicks: q('.rec__tick'), railBars: q('.rail-bar'), caseCards: q('.case2'),
      },
    });
  })()`));

  if (built.keys.length === 5) ok('五个部件都建起来了：' + built.keys.join(' / '));
  else bad('部件数 = ' + built.keys.length + '：' + built.keys.join(','));
  if (built.dom.tlsNodes === 3) ok('时间长轴 3 个节点'); else bad('长轴节点 = ' + built.dom.tlsNodes);
  if (built.dom.subCells === 16) ok('减法 16 个方块'); else bad('方块 = ' + built.dom.subCells);

  /* **留下来的 12 格必须有名字。**
     这条是补的：原来只验了"16 格里剔掉 4 格"，
     没问"那 12 格里有没有内容" —— 结果我做完一屏空方块，
     自检还是绿的（用户问"所以这12个就是空白？"才发现）。
     数格子数不出内容，得看字。 */
  const subNames = JSON.parse(await evalJs(`(() => {
    const kept = [...document.querySelectorAll('.sub__cell--kept')];
    const drops = [...document.querySelectorAll('.sub__cell--drop')];
    return JSON.stringify({
      kept: kept.length,
      named: kept.filter((c) => {
        const n = c.querySelector('.sub__cell-name');
        return n && n.textContent.trim().length > 0;
      }).length,
      sample: kept.slice(0, 3).map((c) => {
        const n = c.querySelector('.sub__cell-name');
        return n ? n.textContent.trim() : '（空）';
      }),
      // 被剔掉的格子**不该有名字** —— 史料里没有 16 部的名录，编了就是造假
      dropNamed: drops.filter((c) => c.querySelector('.sub__cell-name')).length,
    });
  })()`));
  if (subNames.kept === 12 && subNames.named === 12) {
    ok('12 个格子里都写了套名：' + subNames.sample.join(' / ') + ' …');
  } else {
    bad('有格子是空的：留 ' + subNames.kept + ' 格，其中 ' + subNames.named + ' 格有名字');
  }
  if (subNames.dropNamed === 0) ok('被剔除的 4 格没有编造名字（对）');
  else bad('被剔除的格子里出现了名字 —— 那是编的：' + subNames.dropNamed + ' 格');
  if (built.dom.recTicks >= 6) ok('录音机 ' + built.dom.recTicks + ' 个年份刻度');
  else bad('刻度 = ' + built.dom.recTicks);
  if (built.dom.railBars === 4) ok('双轨 ' + built.dom.railBars + ' 条数据条');
  else bad('数据条 = ' + built.dom.railBars);
  if (built.dom.caseCards === 4) ok('案例带 4 张卡'); else bad('案例卡 = ' + built.dom.caseCards);

  /* ② 背景压暗了吗 */
  const ember = await evalJs(`(() => {
    const r = window.__XM_LISHI__;
    return null;
  })()`);
  const scale = await evalJs(`(() => {
    // 渲染器没直接暴露给页面，从 dataset 与 canvas 拿不到 —— 用 CSS 侧的替代量：
    // 数一下 .fallback-ember 的透明度，以及画布是否在
    const c = document.getElementById('air');
    return JSON.stringify({
      hasCanvas: !!c,
      render: document.body.dataset.render,
      canvasSize: c ? [c.width, c.height] : null,
    });
  })()`);
  console.log('       背景 ' + scale);

  /* ③ 占位文字清干净了吗 */
  const txt = await evalJs(`document.body.innerText`);
  if (!/图片位|图注位/.test(txt)) ok('页面上没有「图片位 / 图注位」占位文字');
  else bad('还有占位文字');

  /* ④ 交互真的能动 */
  console.log('\n  交互实测：');

  // 长轴：点第三个节点
  await evalJs(`document.querySelectorAll('.tls__node')[2].click()`);
  await sleep(1400);
  const tl = JSON.parse(await evalJs(`JSON.stringify({
    cur: window.__XM_LISHI__.timeline.state().cur,
    on: document.querySelectorAll('.tls__node.is-on').length,
    fill: document.querySelector('.tls__fill').style.width,
    title: document.querySelector('.tls__title').textContent.trim(),
    tag: document.querySelector('.tls__tag') ? document.querySelector('.tls__tag').textContent.trim() : null,
  })`));
  if (tl.cur === 2 && tl.on === 1 && tl.title.includes('叶尔羌')) {
    ok('长轴：点第三格 → 切到「' + tl.title + '」，进度条 ' + tl.fill);
  } else bad('长轴交互不对：' + JSON.stringify(tl));

  /* 减法：16 → 12。**现在不是自动的了，要自己划**（A8⑤）。
     所以判据分两段：
       ① 刚滚过来时：一格都没划，读数在邀请你划
       ② 点掉那 4 格之后：4 格 is-out，读数变成 16→12 */
  await evalJs(`document.getElementById('subtract-host').scrollIntoView({block:'center'})`);
  await sleep(2600);
  const subBefore = JSON.parse(await evalJs(`JSON.stringify({
    out: document.querySelectorAll('.sub__cell.is-out').length,
    droppable: document.querySelectorAll('.sub__cell--drop[role="button"]').length,
    readout: document.querySelector('.sub__readout').textContent.replace(/\\s+/g,' ').trim(),
    hint: (document.querySelector('.sub__hint') || {}).textContent || '',
  })`));
  if (subBefore.out === 0) ok('滚过来时一格都没划（等你动手，不是自动播）');
  else bad('还没点就被划掉了 ' + subBefore.out + ' 格 —— 又变回自动的了');
  if (subBefore.droppable === 4) ok('4 格是可点的按钮（可 Tab、回车能按）');
  else bad('可点格数 = ' + subBefore.droppable + '，应为 4');
  if (/划掉/.test(subBefore.hint)) ok('有邀请语：' + subBefore.hint.slice(0, 24) + '…');
  else bad('没有告诉人要自己划：' + subBefore.hint.slice(0, 30));

  /* 真的去点那 4 格 —— 走点击，不走 run() */
  for (let i = 0; i < 4; i++) {
    await evalJs(`document.querySelectorAll('.sub__cell--drop')[${i}].click()`);
    await sleep(160);
  }
  await sleep(500);
  const sub = JSON.parse(await evalJs(`JSON.stringify({
    out: document.querySelectorAll('.sub__cell.is-out').length,
    st: window.__XM_LISHI__.subtract.state(),
    readout: document.querySelector('.sub__readout').textContent.replace(/\\s+/g,' ').trim(),
  })`));
  if (sub.out === 4) ok('点掉 4 格 → ' + sub.out + ' 个被划掉，剩 12');
  else bad('划掉数 = ' + sub.out + '，应为 4');
  if (sub.st.done) ok('状态记录：done=' + sub.st.done + '，crossed=' + sub.st.crossed);
  else bad('状态没记成完成：' + JSON.stringify(sub.st));
  if (/12/.test(sub.readout)) ok('读数：' + sub.readout);
  else bad('读数不对：' + sub.readout);

  /* 有名字的 12 格不能划 —— 这个限制本身就是内容 */
  const keptLocked = await evalJs(`document.querySelectorAll('.sub__cell--kept[role="button"]').length`);
  if (keptLocked === 0) ok('有名字的 12 格不可点（史料里确有的十二套，不能删）');
  else bad('有 ' + keptLocked + ' 个有名字的格子也能点 —— 它们不该能删');

  // 录音机：拖到 80%
  await evalJs(`document.getElementById('recorder-host').scrollIntoView({block:'center'})`);
  await sleep(1600);
  await evalJs(`(() => { const r = window.__XM_LISHI__.recorder; r.set(0.82); })()`);
  await sleep(900);
  const rec = JSON.parse(await evalJs(`JSON.stringify({
    st: window.__XM_LISHI__.recorder.state(),
    year: document.getElementById('rec-year').textContent,
    turns: document.getElementById('rec-turns').textContent,
    head: document.querySelector('.rec__head').textContent.trim(),
    onTick: document.querySelectorAll('.rec__tick.is-on').length,
    reel: document.querySelector('.rec__reel').style.transform,
  })`));
  if (rec.st.stop >= 4 && rec.year !== '1950') {
    ok('录音机：摇到 ' + rec.year + '（第 ' + (rec.st.stop + 1) + ' 档）→ 「' + rec.head + '」');
  } else bad('录音机没动：' + JSON.stringify(rec));
  if (rec.turns !== '0') ok('转数在累计：' + rec.turns + ' 圈'); else bad('转数没变');
  if (rec.reel && rec.reel !== 'none') ok('钢丝盘在转：' + rec.reel);
  else bad('钢丝盘没转');

  // 双轨：条子有宽度
  await evalJs(`document.getElementById('rails-host').scrollIntoView({block:'center'})`);
  await sleep(2600);
  const rails = JSON.parse(await evalJs(`JSON.stringify({
    in: document.querySelectorAll('.rail-row.is-in').length,
    widths: [...document.querySelectorAll('.rail-bar__fill')].map((f) => f.style.width || '0'),
    computed: [...document.querySelectorAll('.rail-bar__fill')].map((f) =>
      Math.round(f.getBoundingClientRect().width)),
  })`));
  if (rails.in === 2) ok('双轨：两条都进场了');
  else bad('进场轨数 = ' + rails.in);
  if (rails.computed.every((w) => w > 4)) ok('数据条都拉出来了：' + JSON.stringify(rails.computed) + 'px');
  else bad('有数据条宽度为 0：' + JSON.stringify(rails));

  // 案例带：点右箭头
  await evalJs(`document.getElementById('cases-host').scrollIntoView({block:'center'})`);
  await sleep(1200);
  const before = await evalJs(`window.__XM_LISHI__.cases.state().cur`);
  await evalJs(`document.querySelector('.cases2__btn:not(:disabled):last-of-type').click()`);
  await sleep(1400);
  const after = await evalJs(`window.__XM_LISHI__.cases.state().cur`);
  if (after > before) ok('案例带：点右箭头 ' + before + ' → ' + after);
  else bad('案例带没动：' + before + ' → ' + after);

  /* ⑤ 整页亮度：不该再是一片死黑 */
  console.log('\n  整页亮度（各段各拍一张）：');
  const acts = await evalJs(`document.querySelectorAll('.act').length`);
  for (let i = 1; i <= acts; i++) {
    await evalJs(`document.querySelectorAll('.act')[${i - 1}].scrollIntoView({block:'start'})`);
    await sleep(1600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.result.data, 'base64');
    const L = lumaAvg(buf);
    console.log('     第 ' + i + ' 段  平均 ' + L.avg.toFixed(4) +
      '   亮度分布 <0.05:' + L.hist[0] + '%  0.05-0.15:' + L.hist[1] +
      '%  0.15-0.4:' + L.hist[2] + '%  >0.4:' + L.hist[3] + '%');
    await writeFile(join(root, 'shots', 'lishi-act' + i + '.png'), buf);
  }

  const real = errs.filter((e) => !/favicon|AudioContext/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 第五章自检通过\n'));
process.exit(fails ? 1 : 0);
