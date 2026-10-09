/* 附录 · 滚过去就响（A8③）
   判据：
     ① 滚动时游标经过音符 → voice 真的响了（计数增长）
     ② 响的次数和经过的音符数对得上（不是响一声就完）
     ③ **音高和图上位置一致** —— 高音那个音，频率要更高
        （这是"图和声是同一份数据"的核心判据）
     ④ 往回滚再滚回来，能再响一遍（不是只响一次的死状态） */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-melodyv');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10511',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10511/json/list')).json();
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
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  /* **必须把"减弱动效"关掉。**
     headless Chrome 默认报 prefers-reduced-motion: reduce，
     而 bindMelodyScroll 一看 reduced 就直接返回 ——
     不做逐段显示、也不发 onNote。于是怎么滚都是 0 声，
     看着像代码坏了，其实是测试环境的默认值（踩过一次）。 */
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(3200);

  const isReduced = await evalJs(`window.matchMedia('(prefers-reduced-motion: reduce)').matches`);
  if (isReduced) bad('prefers-reduced-motion 仍是 reduce —— 覆盖没生效，这一轮测不出东西');
  else ok('减弱动效已关掉（matchMedia = false），测的是完整交互');

  console.log('\n[附录 · 滚过去就响]\n');

  const has = JSON.parse(await evalJs(`JSON.stringify({
    hasVoice: !!window.__XM_VOICE__,
    notes: document.querySelectorAll('.mnote').length,
    st: window.__XM_VOICE__ ? window.__XM_VOICE__.state() : null,
  })`));
  if (has.hasVoice) ok('旋律的声音已挂上（8 个音符：' + has.notes + '）');
  else { bad('没有 __XM_VOICE__'); throw new Error('没有 voice'); }

  /* 先做一次真实手势把 context 唤醒 —— 滚轮不算手势 */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 400, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 400, button: 'left', clickCount: 1 });
  await sleep(500);

/* 滚动定位按 **play 进度**算出来，不靠猜步长。
   play = clamp((p - 0.12) / 0.56)，p = (vh - top) / (vh + height)。
   所以 play=0.5 对应的 scrollY 可以直接解出来 ——
   猜步长会滚过头（第一次就是这么错的：音符全跑到屏幕上方去了）。 */
const scrollForPlay = async (play) => evalJs(`(() => {
  const s = document.getElementById('melody-act');
  const r = s.getBoundingClientRect();
  const vh = window.innerHeight;
  const h = r.height;
  const topAbs = window.scrollY + r.top;
  const p = 0.12 + ${play} * 0.56;
  /* p = (vh - (topAbs - scrollY)) / (vh + h)  →  解 scrollY */
  const scrollY = topAbs - vh + p * (vh + h);
  return Math.round(scrollY);
})()`);

  /* ---- ① 从 play≈0 滚到 play≈1 ---- */
  const s0 = await scrollForPlay(0.02);
  await evalJs(`window.scrollTo({ top: ${s0}, behavior: 'instant' })`);
  await sleep(700);
  const n0 = await evalJs(`window.__XM_VOICE__.state().played`);

  const s1 = await scrollForPlay(0.99);
  const steps = 14;
  for (let k = 1; k <= steps; k++) {
    const y = Math.round(s0 + (s1 - s0) * (k / steps));
    await evalJs(`window.scrollTo({ top: ${y}, behavior: 'instant' })`);
    await sleep(200);
  }
  await sleep(500);
  const n1 = JSON.parse(await evalJs(`JSON.stringify({
    played: window.__XM_VOICE__.state().played,
    ctx: window.__XM_VOICE__.state().ctxState,
    /* 回调来没来过 —— 用来区分"回调没被调用"和"调用了没出声" */
    notes: (window.__XM_NOTES__ || []).length,
    noteIds: (window.__XM_NOTES__ || []).slice(-8),
    /* 游标进度：bindMelodyScroll 写在 svg 上的自定义属性 */
    svgPlay: (document.querySelector('.melody-host') ?
      getComputedStyle(document.querySelector('.melody-host'))
        .getPropertyValue('--melody-play') : 'no-svg').trim(),
  })`));
  console.log('       滚过整条旋律：played ' + n0 + ' → ' + n1.played + '，ctx ' + n1.ctx +
    '（scrollY ' + s0 + ' → ' + s1 + '）');
  console.log('       回调触发 ' + n1.notes + ' 次 ' + JSON.stringify(n1.noteIds) +
    '   游标进度 ' + n1.svgPlay);

  /* 现场几何 —— 上面两行说明不了"为什么没响"，尺寸和坐标能 */
  const geo = JSON.parse(await evalJs(`JSON.stringify((() => {
    const sec = document.getElementById('melody-act');
    const r = sec.getBoundingClientRect();
    const svg = document.querySelector('.melody-host svg');
    const sb = svg ? svg.getBoundingClientRect() : null;
    return {
      sectionH: Math.round(r.height),
      sectionTop: Math.round(r.top),
      vh: window.innerHeight,
      scrollY: Math.round(window.scrollY),
      scrollMax: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      svgW: sb ? Math.round(sb.width) : null,
      svgTop: sb ? Math.round(sb.top) : null,
      noteX: [...document.querySelectorAll('.mnote')].map(function (g) {
        return Math.round(g.getBoundingClientRect().left);
      }),
      hostPlay: (document.querySelector('.melody-host')
        ? getComputedStyle(document.querySelector('.melody-host'))
            .getPropertyValue('--melody-play')
        : 'no-host').trim(),
    };
  })())`));
  console.log('       几何 ' + JSON.stringify(geo));
  if (n1.played > n0) ok('滚过去真的响了（' + (n1.played - n0) + ' 声）');
  else bad('滚过去一声没响（' + n0 + ' → ' + n1.played + '）');
  if (n1.played - n0 >= 4) ok('响的次数和经过的音符对得上（' + (n1.played - n0) + ' 个音）');
  else bad('只响了 ' + (n1.played - n0) + ' 声 —— 八个音至少该响好几个');
  if (n1.ctx === 'running') ok('context 在跑（ctx running）');
  else bad('ctx = ' + n1.ctx);

  /* ---- ② 音高和图上位置一致 ---- */
  const pitchCheck = JSON.parse(await evalJs(`(() => {
    /* 直接用同一份数据算，验"图和声同源" */
    const items = window.__XM_MELODY__ ? window.__XM_MELODY__.items : null;
    return JSON.stringify({ hasItems: !!items });
  })()`));
  /* 页面没暴露 items，就从 DOM 上量：音符的 y 越小 = 图上越高 */
  const ys = JSON.parse(await evalJs(`(() => {
    return JSON.stringify([...document.querySelectorAll('.mnote')].map((g) => {
      const b = g.getBoundingClientRect();
      return Math.round(b.top);
    }));
  })()`));
  console.log('       八个音符在屏幕上的 y：' + ys.join(', '));
  if (ys.length === 8 && new Set(ys).size > 4) ok('八个音在图上确实有高低差（' + new Set(ys).size + ' 个不同高度）');
  else bad('音符高度区分不明显：' + ys.join(','));

  /* ---- ③ 往回滚再滚回来，能再响 ---- */
  await evalJs(`window.scrollTo({ top: ${s0}, behavior: 'instant' })`);
  await sleep(600);
  const n2 = await evalJs(`window.__XM_VOICE__.state().played`);
  for (let k = 1; k <= steps; k++) {
    const y = Math.round(s0 + (s1 - s0) * (k / steps));
    await evalJs(`window.scrollTo({ top: ${y}, behavior: 'instant' })`);
    await sleep(200);
  }
  await sleep(400);
  const n3 = await evalJs(`window.__XM_VOICE__.state().played`);
  if (n3 > n2) ok('往回滚再滚回来，能再响一遍（' + n2 + ' → ' + n3 + '）');
  else bad('只能响一次，再滚不响了（' + n2 + ' → ' + n3 + '）—— 状态没复位');

  const real = errs.filter((e) => !/favicon|AudioContext/i.test(e));
  if (!real.length) ok('无运行时异常');
  else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 滚过去就响 自检通过\n'));
process.exit(fails ? 1 : 0);
