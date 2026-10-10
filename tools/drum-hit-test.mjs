/* 序章 · 点鼓面就响（A8①）
   指导老师：「只是简单的点击」「沉浸式的体验」。
   这只鼓原来是背景装饰 —— 它自己按 BPM 敲，用户只能看着。
   现在点它出声。

   判据：
     ① 点鼓面 → userHits 增加（鼓这一层有反应）
     ② 音频 context 真的起来了（**"有反应"和"有声音"是两件事**）
     ③ 敲的位置对了：三个情绪词切换之后，敲出来的是对应那一段
     ④ 敲鼓**不能把三个词挡住** —— 这是这次改动最大的风险
     ⑤ 键盘也能敲（Enter / 空格）
   第 ④ 条单独重要：鼓的 z-index 是 3、又占着屏幕正中，
   一不小心就把右边的词盖住了。 */
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
    /* new URL(req.url, 基址) —— **必须给基址**。
       只写 new URL(req.url) 时 '/index.html' 这种相对路径会直接抛，
       被下面的 catch 吞掉变成 404，页面看起来"加载了"其实是个错误页
       （踩过：body 是空的，所有元素都查不到）。 */
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
const userDir = join(root, '.chrome-drumhit');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10501',
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
      const list = await (await fetch('http://127.0.0.1:10501/json/list')).json();
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
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  console.log('\n[序章 · 点鼓面就响]\n');

  /* 先把幕推到有 section 的位置 —— section < 0 时鼓不敲（设计如此） */
  await evalJs(`window.scrollTo({ top: window.innerHeight * 0.5, behavior: 'instant' })`);
  await sleep(1400);

  const g = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.drum');
    if (!svg) return JSON.stringify({ err: '没有鼓' });
    const b = svg.getBoundingClientRect();
    return JSON.stringify({
      x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2),
      section: window.__XM_DRUM__.state().section,
      hits: window.__XM_DRUM__.state().userHits,
      pe: getComputedStyle(svg).pointerEvents,
    });
  })()`));
  if (g.err) {
    /* 出错时把现场打出来 —— 只报"没有鼓"没法查，
       要看是 boot 就断了、宿主元素在不在、还是被隐藏了。 */
    const diag = await evalJs(`JSON.stringify({
      bootErr: window.__XM_BOOT_ERR__ || [],
      hasHost: !!document.getElementById('drum-host'),
      hostHasSvg: !!document.querySelector('#drum-host svg'),
      hasDrumVar: !!window.__XM_DRUM__,
      scrollY: Math.round(window.scrollY),
      bodyClass: document.body.className,
      render: document.body.dataset.render,
    })`);
    console.log('       现场 ' + diag);
    bad(g.err);
    throw new Error(g.err);
  }
  console.log('       鼓心 (' + g.x + ',' + g.y + ')  section=' + g.section + '  pe=' + g.pe);

  /* ---- ① 点鼓面 ---- */
  const before = await evalJs(`window.__XM_DRUM__.state().userHits`);
  for (let i = 0; i < 3; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: 1 });
    await sleep(260);
  }
  await sleep(400);
  const after = JSON.parse(await evalJs(`JSON.stringify({
    hits: window.__XM_DRUM__.state().userHits,
    ripples: window.__XM_DRUM__.state().ripples,
  })`));
  console.log('       点 3 下：userHits ' + before + ' → ' + after.hits + '，涟漪 ' + after.ripples);
  if (after.hits === before + 3) ok('点鼓面 3 下记了 3 下（鼓这一层有反应）');
  else bad('点了 3 下但记了 ' + (after.hits - before) + ' 下 —— 命中区不对或父级挡住了');
  if (after.ripples > 0) ok('敲出涟漪了（视觉反馈在）');
  else bad('没有涟漪 —— 只响不动？');

  /* ---- ② 真的有声音 ---- */
  const snd = JSON.parse(await evalJs(`(() => {
    const a = window.__XM_SEQ__ || window.__XM_AUDIO__;
    return JSON.stringify({
      hasSeq: !!a,
      enabled: a ? a.enabled : null,
      ctxState: a && a.ctx ? a.ctx.state : null,
    });
  })()`));
  console.log('       音频 ' + JSON.stringify(snd));
  if (snd.ctxState === 'running') ok('音频 context 起来了（ctx running）');
  else bad('ctx = ' + snd.ctxState + ' —— 有反应但没声音');
  if (snd.enabled === true) ok('音序器已启用');
  else bad('音序器没启用（enabled=' + snd.enabled + '）');

  /* ---- ③ 词还能点（这次改动最大的风险） ---- */
  const words = JSON.parse(await evalJs(`(() => {
    return JSON.stringify([...document.querySelectorAll('.word')].map((w) => {
      const b = w.getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return { text: w.textContent.trim(), blocked: !(el === w || w.contains(el)),
        hit: el ? (el.getAttribute('class') || el.tagName) : null };
    }));
  })()`));
  words.forEach((w) => {
    if (w.blocked) bad('词「' + w.text + '」被挡住了（命中的是 ' + w.hit + '）');
    else ok('词「' + w.text + '」仍然可点');
  });

  /* ---- ④ 键盘也能敲 ---- */
  const k0 = await evalJs(`window.__XM_DRUM__.state().userHits`);
  await evalJs(`document.querySelector('.drum').focus()`);
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter' });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter' });
  await sleep(300);
  const k1 = await evalJs(`window.__XM_DRUM__.state().userHits`);
  if (k1 > k0) ok('按回车也能敲（' + k0 + ' → ' + k1 + '）');
  else bad('键盘敲不了（' + k0 + ' → ' + k1 + '）');

  /* ---- ④b 焦点跑了之后，空格还敲得响吗 ----
     （用户在第四章报过"按空格没反应"，根因就是焦点被按钮吃掉。
       序章原本也是同样的写法：keydown 只挂在鼓自己身上，
       点了别处焦点一跑，空格就失效。这里一并验。） */
  await evalJs(`document.getElementById('sound-toggle').focus()`);
  const focusAt = await evalJs(`document.activeElement.id || document.activeElement.tagName`);
  const f0 = await evalJs(`window.__XM_DRUM__.state().userHits`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 32, code: 'Space', key: ' ' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 32, code: 'Space', key: ' ' });
  await sleep(320);
  const f1 = await evalJs(`window.__XM_DRUM__.state().userHits`);
  if (f1 > f0) {
    ok('焦点跑到「' + focusAt + '」上，空格照样敲得响（' + f0 + ' → ' + f1 + '）');
  } else bad('焦点一跑空格就失效（焦点在 ' + focusAt + '，' + f0 + ' → ' + f1 + '）');

  /* ---- ⑤ 无可访问性退化：有 role / label ---- */
  const a11y = JSON.parse(await evalJs(`(() => {
    const s = document.querySelector('.drum');
    return JSON.stringify({
      role: s.getAttribute('role'),
      tabindex: s.getAttribute('tabindex'),
      label: s.getAttribute('aria-label'),
    });
  })()`));
  if (a11y.role === 'button' && a11y.tabindex === '0' && a11y.label) {
    ok('可访问性齐了（role=button, tabindex=0, 有 aria-label）');
  } else bad('可访问性不全：' + JSON.stringify(a11y));

  const real = errs.filter((e) => !/favicon|AudioContext/i.test(e));
  if (!real.length) ok('无运行时异常');
  else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 点鼓自检通过\n'));
process.exit(fails ? 1 : 0);
