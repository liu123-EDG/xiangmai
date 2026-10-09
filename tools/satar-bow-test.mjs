/* 第二章 · 拉萨它尔（A8②）
   判据：
     ① 部件建起来（琴颈、共鸣箱、两根弦、弓）
     ② 拖动真的出声（voiceOn + 音频 context 起来）
     ③ **音高跟着位置走**：拖到左边和右边，频率不一样，而且右边更高
     ④ 松手就停（voiceOn 变 false）—— "你停，它就停"
     ⑤ 再拉一弓还能响（不是一次性的）
     ⑥ 和 drone 同源：音高范围以 drone 基音 110Hz 为基准
   第 ③ 条是核心：这一块要能听出"拉的是哪个音"，不然就只是"能响"。 */
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
const userDir = join(root, '.chrome-bow');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10541',
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
      const list = await (await fetch('http://127.0.0.1:10541/json/list')).json();
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
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/qiongnaieman/index.html` });
  await sleep(4000);

  console.log('\n[第二章 · 拉萨它尔]\n');

  const init = JSON.parse(await evalJs(`(() => {
    const b = window.__XM_BOW__;
    return JSON.stringify({
      hasBow: !!b,
      st: b ? b.state() : null,
      neck: !!document.querySelector('.bow__neck'),
      box: !!document.querySelector('.bow__box'),
      strings: document.querySelectorAll('.bow__string').length,
      hair: !!document.querySelector('.bow__bowhair'),
      readout: (document.querySelector('.bow__readout') || {}).textContent || '',
      bootErr: (window.__XM_BOOT_ERR__ || []).length,
    });
  })()`));
  if (init.hasBow) ok('部件已建');
  else { bad('没有 __XM_BOW__'); throw new Error('没有 bow'); }
  if (init.neck && init.box) ok('琴颈 + 共鸣箱画出来了');
  else bad('琴身缺件：neck=' + init.neck + ' box=' + init.box);
  if (init.strings === 2) ok('两根弦');
  else bad('弦数 = ' + init.strings);
  if (init.hair) ok('弓在');
  else bad('没有弓');
  if (!init.bootErr) ok('脚本没报错');
  else bad('启动错误 ' + init.bootErr + ' 条');

  /* 先做一次真实手势，让音频可用 */
  await evalJs(`document.getElementById('bow-host').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(900);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 300, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 300, button: 'left', clickCount: 1 });
  await sleep(400);

  /* ---- ② 起弓出声 ---- */
  const b0 = JSON.parse(await evalJs(`JSON.stringify({
    ok: window.__XM_BOW__._testBow(0.2),
    st: window.__XM_BOW__.state(),
  })`));
  await sleep(500);
  const b1 = JSON.parse(await evalJs(`JSON.stringify(window.__XM_BOW__.state())`));
  console.log('       起弓 ' + JSON.stringify(b1));
  if (b1.voiceOn) ok('起弓了，弦在响');
  else bad('起弓没响（voiceOn=false）');
  if (b1.ctxState === 'running') ok('音频 context 在跑');
  else bad('ctx = ' + b1.ctxState);

  /* ---- ③ 音高跟着位置走 ---- */
  const lo = JSON.parse(await evalJs(`JSON.stringify((() => {
    window.__XM_BOW__._testBow(0.05);
    return window.__XM_BOW__.state();
  })())`));
  await sleep(250);
  const hi = JSON.parse(await evalJs(`JSON.stringify((() => {
    window.__XM_BOW__._testBow(0.95);
    return window.__XM_BOW__.state();
  })())`));
  await sleep(250);
  console.log('       左边 hz=' + lo.hz + '   右边 hz=' + hi.hz);
  if (hi.hz > lo.hz * 1.4) ok('拖到右边音更高（' + lo.hz + ' → ' + hi.hz + ' Hz）');
  else bad('音高没跟着位置走：左 ' + lo.hz + '，右 ' + hi.hz);

  /* ---- ⑥ 和 drone 同源（220..440 = 110 的两倍到四倍） ---- */
  if (lo.hz >= 200 && lo.hz <= 240 && hi.hz >= 400 && hi.hz <= 480) {
    ok('音域落在 drone 基音 110Hz 的两倍到四倍之间 —— 是"走在母调上面"');
  } else bad('音域和母调对不上：' + lo.hz + '..' + hi.hz);

  /* ---- ④ 松手就停 ---- */
  await evalJs(`window.__XM_BOW__._testRelease()`);
  await sleep(450);
  const released = JSON.parse(await evalJs(`JSON.stringify(window.__XM_BOW__.state())`));
  if (!released.voiceOn) ok('松手就停（"你停，它就停"）');
  else bad('松手了还在响');

  /* ---- ⑤ 再拉一弓还能响 ---- */
  await evalJs(`window.__XM_BOW__._testBow(0.5)`);
  await sleep(400);
  const again = JSON.parse(await evalJs(`JSON.stringify(window.__XM_BOW__.state())`));
  if (again.voiceOn && again.bows >= 2) ok('再拉一弓还能响（共 ' + again.bows + ' 弓）');
  else bad('拉不了第二弓：' + JSON.stringify(again));

  /* ---- 真实拖动：pointer 事件也要能起弓 ---- */
  await evalJs(`window.__XM_BOW__._testRelease()`);
  await sleep(300);
  const box = JSON.parse(await evalJs(`(() => {
    const b = document.querySelector('.bow__svg').getBoundingClientRect();
    return JSON.stringify({
      x1: Math.round(b.left + b.width * 0.3), y: Math.round(b.top + b.height * 0.5),
      x2: Math.round(b.left + b.width * 0.7),
    });
  })()`));
  const beforeDrag = await evalJs(`window.__XM_BOW__.state().bows`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x1, y: box.y, button: 'left', clickCount: 1 });
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x2, y: box.y, button: 'left' });
  await sleep(300);
  const during = JSON.parse(await evalJs(`JSON.stringify(window.__XM_BOW__.state())`));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x2, y: box.y, button: 'left', clickCount: 1 });
  await sleep(400);
  const after = JSON.parse(await evalJs(`JSON.stringify(window.__XM_BOW__.state())`));
  if (during.voiceOn && during.dragging) ok('真实拖动也能起弓（bows ' + beforeDrag + ' → ' + during.bows + '）');
  else bad('拖动没起弓：' + JSON.stringify(during));
  if (!after.voiceOn) ok('拖动松手后停住了');
  else bad('拖动松手还在响');

  const real = errs.filter((e) => !/favicon|AudioContext/i.test(e));
  if (!real.length) ok('无运行时异常');
  else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 拉萨它尔自检通过\n'));
process.exit(fails ? 1 : 0);
