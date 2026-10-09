/* 第四章 · 满圈之后那支片子
   判据分四层：
     ① 点满 16 下 → 幕布出现
     ② 视频真的在放（currentTime 在走），而且**是静音的**（现场已有主题曲）
     ③ 「跳过」按钮有效；不放完也能收场
     ④ 收场之后幕布**真的从 DOM 里移除**、解锁已完成
        —— 幕布挂住会把整页糊死，这一条最要紧 */
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
const userDir = join(root, '.chrome-fullfilm');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10391',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10391/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const bad_req = []; const errs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      bad_req.push(m.params.response.status + ' ' + m.params.response.url.split('/').slice(-2).join('/'));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 140));
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

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[满圈之后那支片子]\n');

  /* 清掉解锁标记，保证这一遍是真的从"没满圈"走到"满圈" */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(1200);
  await evalJs(`localStorage.removeItem('xiangmai.unlocked.mashrap')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3400);

  /* ---- ① 满圈之前：不该有幕布 ---- */
  const before = JSON.parse(await evalJs(`(() => {
    const f = window.__XM_FILM__;
    return JSON.stringify({
      hasFilm: !!f,
      st: f ? f.state() : null,
      inDom: !!document.querySelector('.fullfilm'),
      unlocked: localStorage.getItem('xiangmai.unlocked.mashrap') === '1',
    });
  })()`));
  if (before.hasFilm) ok('片子组件已挂上（满圈前就在 DOM 外待命）');
  else bad('没有 __XM_FILM__');
  if (!before.inDom) ok('满圈前没有幕布（state=' + (before.st && before.st.phase) + '）');
  else bad('满圈前幕布就出现了');
  if (!before.unlocked) ok('满圈前未解锁（起点干净）');
  else bad('起点就是解锁状态，这一遍测不出东西');

  /* ---- ② 点满 16 下 ----
     **先滚，等滚动停，再量坐标，最后点。**
     原来把 scrollIntoView 和量坐标写在同一个 evalJs 里 ——
     页面开了 scroll-behavior: smooth，量到的是滚动动画**中途**的位置，
     于是 16 下全点在圆圈外面（count 一直是 0，踩过）。 */
  await evalJs(`document.getElementById('mq-act').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1400);
  const geo = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.mq');
    if (!svg) return JSON.stringify({ err: '找不到圆圈' });
    const r = svg.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    return JSON.stringify({ x, y, hit: hit ? (hit.getAttribute('class') || hit.tagName) : null });
  })()`));
  console.log('       圆圈中心 (' + geo.x + ', ' + geo.y + ')  命中 ' + geo.hit);

  /* 点到最后一下之后**马上就读** —— 片子只有 15 秒，
     而"用实心鼠标一下下点满 16 下"要花掉大部分时间。
     原来点完再等 1.6 秒才读，那时片子已经快放完了（踩过：
     读到 phase='done'，幕布早撤了，看着像"没出现"）。 */
  let popped = null;
  for (let i = 0; i < 16; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geo.x, y: geo.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geo.x, y: geo.y, button: 'left', clickCount: 1 });
    if (i === 15) {
      // 最后一下：立刻抓两次，确认幕布真的出现且视频在放
      await sleep(700);
      popped = JSON.parse(await evalJs(`(() => {
        const f = window.__XM_FILM__;
        const v = document.querySelector('.fullfilm video');
        const o = document.querySelector('.fullfilm');
        return JSON.stringify({
          st: f ? f.state() : null,
          hasVideo: !!v,
          src: v ? (v.getAttribute('src') || '') : '',
          muted: v ? v.muted : null,
          paused: v ? v.paused : null,
          t: v ? +v.currentTime.toFixed(2) : null,
          w: v ? v.videoWidth : 0,
          playsInline: v ? (v.hasAttribute('playsinline') || v.playsInline) : null,
          err: v && v.error ? v.error.code : null,
          overlayOp: o ? +(+getComputedStyle(o).opacity).toFixed(2) : null,
          hasSkip: !!document.querySelector('.fullfilm__skip'),
          unlocked: localStorage.getItem('xiangmai.unlocked.mashrap') === '1',
        });
      })()`));
    } else {
      await sleep(180);
    }
  }
  await sleep(2200);   // 给视频一点时间解出画面

  /* ---- ③ 幕布出现、视频在放、静音 ---- */
  const after = JSON.parse(await evalJs(`(() => {
    const f = window.__XM_FILM__;
    const v = document.querySelector('.fullfilm video');
    const o = document.querySelector('.fullfilm');
    return JSON.stringify({
      st: f ? f.state() : null,
      popped: ${JSON.stringify(popped)},
      hasVideo: !!v,
      src: v ? (v.getAttribute('src') || '') : '',
      muted: v ? v.muted : null,
      paused: v ? v.paused : null,
      t: v ? +v.currentTime.toFixed(2) : null,
      w: v ? v.videoWidth : 0,
      playsInline: v ? (v.hasAttribute('playsinline') || v.playsInline) : null,
      err: v && v.error ? v.error.code : null,
      overlayOp: o ? +(+getComputedStyle(o).opacity).toFixed(2) : null,
      hasSkip: !!document.querySelector('.fullfilm__skip'),
      unlocked: localStorage.getItem('xiangmai.unlocked.mashrap') === '1',
    });
  })()`));
  after.atPop = popped;
  console.log('       幕布状态 ' + JSON.stringify(after.st));
  console.log('       视频 ' + JSON.stringify({ src: after.src, muted: after.muted,
    paused: after.paused, t: after.t, w: after.w, err: after.err }));

  if (after.hasVideo || after.st.hasBox) ok('满圈后幕布出现');
  else bad('满圈后没有幕布');
  if (after.src && /full-circle-slim/.test(after.src)) ok('取的是压好的片子：' + after.src);
  else bad('视频路径不对：' + after.src);
  if (after.muted === true) ok('视频静音（现场主题曲在放，不该打架）');
  else bad('视频没静音 —— 会和主题曲撞');
  if (after.playsInline) ok('playsinline 在（手机上不会全屏劫持）');
  else bad('缺 playsinline');
  if (after.w > 0) ok('画面已解出 ' + after.w + 'px');
  else bad('视频没解出画面，err=' + after.err);
  if (after.hasSkip) ok('有「跳过」按钮');
  else bad('没有跳过按钮 —— 15 秒不让跳是惩罚');
  if (after.unlocked) ok('解锁在满圈那一刻就完成了（片子只是仪式，不是门槛）');
  else bad('解锁没完成');

  /* ---- ④ 播放头在走 ---- */
  const t1 = after.t;
  await sleep(2200);
  const t2 = await evalJs(`(() => { const v = document.querySelector('.fullfilm video');
    return v ? +v.currentTime.toFixed(2) : -1; })()`);
  if (t2 > t1) ok('播放头在走 ' + t1 + ' → ' + t2);
  else bad('播放头没动（' + t1 + ' → ' + t2 + '）');

  /* ---- ⑤ 跳过 → 渐渐消失 → 从 DOM 移除 ---- */
  await evalJs(`document.querySelector('.fullfilm__skip').click()`);
  await sleep(600);
  const midOut = JSON.parse(await evalJs(`(() => {
    const o = document.querySelector('.fullfilm');
    return JSON.stringify({
      phase: window.__XM_FILM__.state().phase,
      op: o ? +(+getComputedStyle(o).opacity).toFixed(2) : null,
      isOut: o ? o.classList.contains('is-out') : null,
    });
  })()`));
  console.log('       跳过之后 ' + JSON.stringify(midOut));
  if (midOut.phase === 'out' && midOut.isOut) ok('跳过 → 进入淡出（不是硬切）');
  else bad('跳过没有进入淡出：' + JSON.stringify(midOut));
  if (midOut.op !== null && midOut.op < 1) ok('正在渐渐消失（opacity ' + midOut.op + '）');
  else bad('opacity 还是 ' + midOut.op + '，没在淡');

  await sleep(2600);
  const end = JSON.parse(await evalJs(`(() => {
    const f = window.__XM_FILM__;
    return JSON.stringify({
      st: f.state(),
      inDom: !!document.querySelector('.fullfilm'),
      unlocked: localStorage.getItem('xiangmai.unlocked.mashrap') === '1',
      pageOk: !document.body.classList.contains('is-loading'),
    });
  })()`));
  console.log('       收场之后 ' + JSON.stringify(end));
  if (!end.inDom) ok('幕布已从 DOM 移除（不会糊住页面）');
  else bad('幕布还在 DOM 里 —— 会把整页盖住');
  if (end.unlocked) ok('解锁保持');
  else bad('解锁丢了');

  /* ---- ⑥ 无 404、无异常 ---- */
  if (!bad_req.length) ok('没有请求失败');
  else bad('有请求失败：' + bad_req.slice(0, 3).join('，'));
  const real = errs.filter((e) => !/favicon|AudioContext/i.test(e));
  if (!real.length) ok('无运行时异常');
  else real.slice(0, 3).forEach((e) => bad(e));

  /* ---- ⑦ 不跳过：让它自己放完 ----
     这一条最要紧。webm 的 duration 是 Infinity（MediaRecorder 的产物没有
     时长元数据），所以 `ended` 到底触不触发是个未知数 ——
     不触发就只能靠 watchdog 兜。两种都算过关，但**必须真的收场**：
     幕布挂住会把整页糊死。 */
  console.log('\n  ── 不跳过，等它自己放完 ──');
  await evalJs(`localStorage.removeItem('xiangmai.unlocked.mashrap')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3400);
  await evalJs(`document.getElementById('mq-act').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1200);
  const g2 = JSON.parse(await evalJs(`(() => {
    const r = document.querySelector('.mq').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
  })()`));
  const t0 = Date.now();
  for (let i = 0; i < 16; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g2.x, y: g2.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g2.x, y: g2.y, button: 'left', clickCount: 1 });
    await sleep(i === 15 ? 300 : 170);
  }

  let selfEnd = null;
  for (let s = 0; s < 32; s++) {
    await sleep(1000);
    const st = JSON.parse(await evalJs(`(() => {
      const f = window.__XM_FILM__;
      const v = document.querySelector('.fullfilm video');
      return JSON.stringify({
        phase: f.state().phase, why: f.state().why, inDom: f.state().inDom,
        t: v ? +v.currentTime.toFixed(1) : null, paused: v ? v.paused : null,
      });
    })()`));
    if (s % 4 === 0 || st.phase === 'done') {
      console.log('       ' + String(s + 1).padStart(2) + 's  phase=' + st.phase.padEnd(8) +
        ' t=' + st.t + '  paused=' + st.paused + (st.why ? '  why=' + st.why : ''));
    }
    if (st.phase === 'done' && !st.inDom) { selfEnd = { sec: s + 1, why: st.why }; break; }
  }
  const totalSec = +((Date.now() - t0) / 1000).toFixed(1);
  if (selfEnd) {
    ok('没跳过也能自己收场：' + selfEnd.sec + 's，原因「' + selfEnd.why + '」');
    if (/播完|超时兜底|watchdog/.test(selfEnd.why)) ok('收场原因合理（' + selfEnd.why + '）');
    else bad('收场原因可疑：' + selfEnd.why);
  } else {
    bad('32 秒内没自己收场 —— 幕布会一直挂着');
  }
  if (totalSec < 45) ok('全程 ' + totalSec + ' 秒（片子 15 秒 + 淡出 1.8 秒，合理）');
  else bad('全程 ' + totalSec + ' 秒，太久了');

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 满圈片子自检通过\n'));
process.exit(fails ? 1 : 0);
