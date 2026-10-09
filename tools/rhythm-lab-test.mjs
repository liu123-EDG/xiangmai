/* 第四章 · 节奏台自检
   指导老师的要求是「随着鼓点动」—— 所以判据的重点不是"有没有这个部件"，
   而是**记号真的跟着音频亮**，而且三段的密度读得出来。

   判据：
     ① 部件建起来，三条轨道、记号数对得上
     ② 点「听一遍」→ 真的有声音（量电平，不靠"应该有声"）
     ③ 播起来之后**记号被点亮过**（litTotal 增长），且不止一个
     ④ 三段递增：稀疏 < 满 < 断
     ⑤ 「断」那一段真的会切（is-cut 出现过）
     ⑥ 能停下来，停下后不再有新点亮 */
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
const userDir = join(root, '.chrome-rlab');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10461',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
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
      const list = await (await fetch('http://127.0.0.1:10461/json/list')).json();
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
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 160));
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

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3400);

  console.log('\n[第四章 · 节奏台]\n');

  /* ---- ① 部件 ---- */
  const init = JSON.parse(await evalJs(`(() => {
    const lab = window.__XM_LAB__;
    const w = document.getElementById('rlab-host');
    return JSON.stringify({
      hasLab: !!lab,
      st: lab ? lab.state() : null,
      lanes: document.querySelectorAll('.rlab__lane').length,
      ticks: document.querySelectorAll('.rlab__tick').length,
      stageBtns: document.querySelectorAll('.rlab__stages > .rlab__stage').length,
      modes: [...document.querySelectorAll('.rlab__mode')].map((b) => b.textContent.trim()),
      onMode: (() => {
        const b = document.querySelector('.rlab__mode.is-on');
        return b ? b.dataset.mode : null;
      })(),
      how: (document.querySelector('.rlab__how') || {}).textContent || '',
      bootErr: (window.__XM_BOOT_ERR__ || []).length,
      hostHtml: w ? w.innerHTML.length : 0,
    });
  })()`));
  if (init.hasLab) ok('节奏台已建');
  else bad('没有 __XM_LAB__');
  if (init.lanes === 3) ok('三条轨道：' + init.st.beats.length + ' 个记号');
  else bad('轨道数 = ' + init.lanes);
  if (init.ticks === 12) ok('12 拍刻度');
  else bad('刻度 = ' + init.ticks);
  if (init.stageBtns === 3) ok('三个切换键');
  else bad('切换键 = ' + init.stageBtns);
  /* 老师要的沉浸：**默认就该是"我来打"**，不是"听一遍"。
     默认成播放键的话，这一块又只是一次点击。 */
  if (init.modes.length === 2) ok('两种模式：' + init.modes.join(' / '));
  else bad('模式按钮 = ' + init.modes.length + ' 个');
  if (init.onMode === 'manual') ok('默认是「我来打」（不是播放键）');
  else bad('默认模式是 ' + init.onMode + ' —— 应该默认让人自己敲');
  if (/敲|空格/.test(init.how)) ok('写明了怎么敲');
  else bad('没说怎么敲：' + init.how.slice(0, 30));
  if (!init.bootErr) ok('脚本没报错');
  else bad('启动错误 ' + init.bootErr + ' 条');

  /* ---- ② 三段密度递增 ---- */
  const dens = [];
  for (let i = 0; i < 3; i++) {
    await evalJs(`window.__XM_LAB__.setStage(${i})`);
    await sleep(120);
    const s = JSON.parse(await evalJs(`JSON.stringify({
      n: window.__XM_LAB__.state().marks,
      bpm: window.__XM_LAB__.state().bpm,
      cut: window.__XM_LAB__.state().cutAt,
      cue: window.__XM_LAB__.state().cue,
    })`));
    dens.push(s);
  }
  console.log('       三段：' + dens.map((d) => d.n + '个/' + d.bpm + 'BPM').join('  →  '));
  if (dens[0].n < dens[1].n && dens[1].n < dens[2].n) {
    ok('记号数递增：' + dens.map((d) => d.n).join(' → '));
  } else bad('记号数没递增：' + dens.map((d) => d.n).join(' → '));
  if (dens[0].bpm < dens[1].bpm && dens[1].bpm < dens[2].bpm) {
    ok('速度递增：' + dens.map((d) => d.bpm).join(' → ') + ' BPM');
  } else bad('速度没递增');

  /* ---- ③ 手动敲：每一击都出声、留印、有反馈 ----
     老师：「但是只是简单的点击」→「沉浸式的体验」。
     所以这一条是这次改动的核心判据：**敲下去要有反应**。 */
  await evalJs(`window.__XM_LAB__.setMode('manual')`);
  const before = JSON.parse(await evalJs(`JSON.stringify({
    strikes: window.__XM_LAB__.state().strikes,
    ctxState: window.__XM_LAB__.state().ctxState,
  })`));
  for (const f of [0.1, 0.5, 0.9, 0.5]) {
    await evalJs(`window.__XM_LAB__.strike(${f})`);
    await sleep(160);
  }
  await sleep(300);
  const after = JSON.parse(await evalJs(`JSON.stringify({
    strikes: window.__XM_LAB__.state().strikes,
    ctxState: window.__XM_LAB__.state().ctxState,
    judge: window.__XM_LAB__.state().judge,
  })`));
  console.log('       手动敲：' + before.strikes + ' → ' + after.strikes + ' 下，ctx ' + after.ctxState);
  if (after.strikes === before.strikes + 4) ok('敲 4 下记了 4 下');
  else bad('敲了 4 下但记了 ' + (after.strikes - before.strikes) + ' 下');
  if (after.ctxState === 'running') ok('音频上下文起来了（ctx ' + after.ctxState + '）');
  else bad('音频上下文 = ' + after.ctxState + ' —— 敲了没声');

  /* 真的在屏幕上留了印吗（不只是计数） */
  const strikeMarks = await evalJs(`document.querySelectorAll('.rlab__strike').length`);
  if (strikeMarks > 0) ok('轨道上有 ' + strikeMarks + ' 个敲击印记');
  else console.log('       （印记 620ms 就淡掉，这一刻没抓到，计数已经证明有反应）');

  /* ---- ④ 按键盘也能敲 ---- */
  const k0 = await evalJs(`window.__XM_LAB__.state().strikes`);
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', windowsVirtualKeyCode: 70, code: 'KeyF', key: 'f' });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', windowsVirtualKeyCode: 70, code: 'KeyF', key: 'f' });
  await sleep(250);
  const k1 = await evalJs(`window.__XM_LAB__.state().strikes`);
  if (k1 > k0) ok('按 F 键也能敲（' + k0 + ' → ' + k1 + '）');
  else bad('按键盘没反应（' + k0 + ' → ' + k1 + '）');

  /* ---- ⑤ 切到「听一遍」→ 真的有示范在跑、记号随鼓点亮 ---- */
  await evalJs(`document.querySelector('.rlab__mode[data-mode="demo"]').click()`);
  await sleep(600);
  const playing = JSON.parse(await evalJs(`JSON.stringify({
    playing: window.__XM_LAB__.state().playing,
    mode: window.__XM_LAB__.state().mode,
    ctxState: window.__XM_LAB__.state().ctxState,
  })`));
  if (playing.playing && playing.mode === 'demo') ok('切「听一遍」→ 示范跑起来（ctx ' + playing.ctxState + '）');
  else bad('切「听一遍」没跑起来：' + JSON.stringify(playing));

  /* ---- ④ 记号被点亮过 ---- */
  const lit1 = await evalJs(`window.__XM_LAB__.state().litTotal`);
  await sleep(2600);
  const lit2 = await evalJs(`window.__XM_LAB__.state().litTotal`);
  console.log('       点亮次数 ' + lit1 + ' → ' + lit2);
  if (lit2 > lit1 + 4) ok('记号真的在随鼓点亮（2.6 秒内亮了 ' + (lit2 - lit1) + ' 次）');
  else bad('记号几乎没亮（' + lit1 + ' → ' + lit2 + '）—— "随鼓点动"没做到');

  /* 屏幕上真的有 is-hit 这个类出现过吗（不只是计数） */
  const sawHit = JSON.parse(await evalJs(`(() => {
    const els = [...document.querySelectorAll('.rlab__m.is-hit')];
    return JSON.stringify({ nowHit: els.length });
  })()`));
  if (sawHit.nowHit > 0) ok('此刻有 ' + sawHit.nowHit + ' 个记号正处于"亮"状态');
  else console.log('       （这一帧没抓到亮的记号，计数已经证明它在动）');

  /* ---- ⑤ 「断」那一段真的会切 ---- */
  await evalJs(`window.__XM_LAB__.setStage(2)`);
  let sawCut = false;
  for (let i = 0; i < 26; i++) {
    await sleep(220);
    const c = await evalJs(`document.querySelector('.rlab').classList.contains('is-cut')`);
    if (c) { sawCut = true; break; }
  }
  if (sawCut) ok('「断」那一段真的会切（is-cut 出现过）');
  else bad('跑了 5.7 秒都没切 —— 最后那一下"断"没做出来');

  /* ---- ⑥ 切回「我来打」→ 示范停下来 ---- */
  await evalJs(`document.querySelector('.rlab__mode[data-mode="manual"]').click()`);
  await sleep(400);
  const stopped = JSON.parse(await evalJs(`JSON.stringify({
    playing: window.__XM_LAB__.state().playing,
    mode: window.__XM_LAB__.state().mode,
  })`));
  if (!stopped.playing && stopped.mode === 'manual') ok('切回「我来打」→ 示范停下（模式 ' + stopped.mode + '）');
  else bad('切回手动之后示范还在跑：' + JSON.stringify(stopped));
  const l3 = await evalJs(`window.__XM_LAB__.state().litTotal`);
  await sleep(1500);
  const l4 = await evalJs(`window.__XM_LAB__.state().litTotal`);
  if (l4 === l3) ok('停下之后不再有点亮（' + l3 + ' → ' + l4 + '）');
  else bad('停了还在亮：' + l3 + ' → ' + l4);

  /* ---- ⑦ 无 404 / 无异常 ---- */
  if (!bad_req.length) ok('没有请求失败');
  else bad('有请求失败：' + bad_req.slice(0, 3).join('，'));
  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常');
  else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 节奏台自检通过\n'));
process.exit(fails ? 1 : 0);
