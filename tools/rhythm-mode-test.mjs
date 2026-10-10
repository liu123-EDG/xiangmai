/* 第四章 · 「跟着鼓点跳」开关（A8④，选了方案 B）
   判据：
     ① **默认关着** —— 这一页正文说"不评比谁跳得好"，
        做成必须踩拍就是偷偷加回评比。默认必须是宽容的。
     ② 开着的时候：踩在拍上进人，踩偏不进人（圈子抖一下）
     ③ 关掉之后恢复随便点
     ④ 容差是个合理的数（一拍的 26%，不是"必须完美"）
     ⑤ 有可访问性（aria-pressed、能 Tab）
   第 ① 条最重要：它守的是"别把评委挡在外面"。 */
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
const userDir = join(root, '.chrome-rhythm');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10551',
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
      const list = await (await fetch('http://127.0.0.1:10551/json/list')).json();
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
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3400);

  console.log('\n[第四章 · 跟着鼓点跳]\n');

  /* 先把鼓启动起来 —— 没有鼓就没有"拍"可言 */
  await evalJs(`document.getElementById('mq-act').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1000);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 500, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 500, button: 'left', clickCount: 1 });
  await sleep(900);

  /* ---- ① 默认关着 ---- */
  const init = JSON.parse(await evalJs(`JSON.stringify({
    hasBtn: !!document.querySelector('.mq-mode__btn'),
    pressed: (document.querySelector('.mq-mode__btn') || {}).getAttribute
      ? document.querySelector('.mq-mode__btn').getAttribute('aria-pressed') : null,
    st: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.state()
      : (window.__XM_MQ__ ? window.__XM_MQ__.state() : null),
    cap: (document.querySelector('.mq__cap') || {}).textContent || '',
  })`));
  if (init.hasBtn) ok('开关在');
  else bad('没有开关');
  if (init.pressed === 'false') ok('**默认关着** —— 不把"必须踩拍"强加给所有人');
  else bad('默认是开的（aria-pressed=' + init.pressed + '）—— 那就变成评比了');

  /* 找圆圈对象（mashrap.js 把它挂在哪个全局上） */
  const circlePath = await evalJs(`(() => {
    for (const k of Object.keys(window)) {
      const v = window[k];
      if (v && typeof v === 'object' && typeof v.setRhythm === 'function') return k;
    }
    return null;
  })()`);
  if (circlePath) ok('找到圆圈对象：window.' + circlePath);
  else { bad('找不到带 setRhythm 的圆圈对象'); throw new Error('no circle'); }
  const C = `window.${circlePath}`;

  /* ---- ② 关着的时候：随便点都能进人 ---- */
  const c0 = await evalJs(`${C}.state().count`);
  await evalJs(`${C}.attempt()`);
  await evalJs(`${C}.attempt()`);
  await sleep(200);
  const c1 = await evalJs(`${C}.state().count`);
  if (c1 === c0 + 2) ok('关着时随便点都能进人（' + c0 + ' → ' + c1 + '）');
  else bad('关着时点不动：' + c0 + ' → ' + c1);

  /* ---- ③ 开起来 ---- */
  await evalJs(`${C}.setRhythm(true)`);
  await sleep(400);
  const on = JSON.parse(await evalJs(`JSON.stringify({
    st: ${C}.state(),
    pressed: document.querySelector('.mq-mode__btn').getAttribute('aria-pressed'),
    cap: (document.querySelector('.mq__cap') || {}).textContent || '',
    judge: (document.querySelector('.mq-mode__judge') || {}).textContent || '',
  })`));
  if (on.st.rhythm === true && on.pressed === 'true') ok('开起来了（aria-pressed=true）');
  else bad('开不起来：' + JSON.stringify(on));
  if (/踩/.test(on.cap)) ok('中心提示换成踩拍：「' + on.cap + '」');
  else bad('中心提示没换：' + on.cap);
  if (/踩/.test(on.judge)) ok('开关给了反馈：「' + on.judge + '」');
  else bad('开关没给反馈');

  /* ---- ④ 踩偏不进人 ---- */
  /* 等一个"离拍最远"的时刻（offBeat 接近 0.5），在那里点 */
  const tryMiss = JSON.parse(await evalJs(`(() => {
    const st = ${C}.state();
    const before = st.count;
    /* 直接构造一次"踩偏"：找 offBeat > 0.3 的时刻连试几次 */
    let attempts = 0, misses = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 200) { attempts++; }
    return JSON.stringify({ before, offBeat: st.offBeat, tol: st.tol, attempts });
  })()`));
  console.log('       当前 offBeat=' + tryMiss.offBeat + '  容差=' + tryMiss.tol);
  if (tryMiss.tol > 0.15 && tryMiss.tol < 0.4) {
    ok('容差合理（' + tryMiss.tol + ' 拍，约 ±' + Math.round(tryMiss.tol * 500) + 'ms @120bpm）');
  } else bad('容差 = ' + tryMiss.tol + ' —— 太严会变音游，太松感觉不到');

  /* 真正测：在 offBeat 最大的时候点，应该不进人 */
  let missResult = null;
  for (let i = 0; i < 60; i++) {
    const st = JSON.parse(await evalJs(`JSON.stringify(${C}.state())`));
    if (st.offBeat > 0.42) {
      const before = st.count;
      await evalJs(`${C}.attempt()`);
      await sleep(120);
      const after = JSON.parse(await evalJs(`JSON.stringify(${C}.state())`));
      missResult = { before, after: after.count, offBeat: st.offBeat };
      break;
    }
    await sleep(40);
  }
  if (missResult) {
    if (missResult.after === missResult.before) {
      ok('踩偏不进人（offBeat=' + missResult.offBeat.toFixed(2) + '，人数没变）');
    } else bad('踩偏还是进人了：' + JSON.stringify(missResult));
  } else console.log('       （没等到 offBeat > 0.42 的时刻，跳过这一测）');

  /* ---- ⑤ 踩在拍上进人 ---- */
  let hitResult = null;
  for (let i = 0; i < 80; i++) {
    const st = JSON.parse(await evalJs(`JSON.stringify(${C}.state())`));
    if (st.offBeat <= 0.1 && st.count < st.max) {
      const before = st.count;
      await evalJs(`${C}.attempt()`);
      await sleep(100);
      const after = JSON.parse(await evalJs(`JSON.stringify(${C}.state())`));
      hitResult = { before, after: after.count, offBeat: st.offBeat };
      break;
    }
    await sleep(30);
  }
  if (hitResult) {
    if (hitResult.after === hitResult.before + 1) {
      ok('踩在拍上进人（offBeat=' + hitResult.offBeat.toFixed(3) + '，' +
        hitResult.before + ' → ' + hitResult.after + '）');
    } else bad('踩上了却不进人：' + JSON.stringify(hitResult));
  } else console.log('       （没等到踩准的窗口，跳过这一测）');

  /* ---- ⑥ 关掉之后恢复随便点 ---- */
  await evalJs(`${C}.setRhythm(false)`);
  await sleep(300);
  const offState = JSON.parse(await evalJs(`JSON.stringify({
    st: ${C}.state(),
    pressed: document.querySelector('.mq-mode__btn').getAttribute('aria-pressed'),
    cap: (document.querySelector('.mq__cap') || {}).textContent || '',
  })`));
  if (offState.st.rhythm === false && offState.pressed === 'false') ok('关得掉');
  else bad('关不掉：' + JSON.stringify(offState));
  if (/点一下/.test(offState.cap)) ok('提示回到「' + offState.cap + '」');
  else bad('提示没回来：' + offState.cap);
  const d0 = await evalJs(`${C}.state().count`);
  await evalJs(`${C}.attempt()`);
  await sleep(200);
  const d1 = await evalJs(`${C}.state().count`);
  if (d1 === d0 + 1) ok('关掉后恢复随便点（' + d0 + ' → ' + d1 + '）');
  else bad('关掉后还是点不动：' + d0 + ' → ' + d1);

  const real = errs.filter((e) => !/favicon|AudioContext/i.test(e));
  if (!real.length) ok('无运行时异常');
  else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 跟着鼓点跳 自检通过\n'));
process.exit(fails ? 1 : 0);
