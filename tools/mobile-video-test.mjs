/* 手机端实测：视频到底放不放、放的是小版还是大版、能不能播。
   用 CDP 模拟手机（窄屏 + 触摸 + 低并发核数），不是靠改窗口大小糊弄。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
/* .webm 的 MIME 一定要对 —— 发成 octet-stream 浏览器会拒播，
   而且不报错，只给一个 error code 4（这个坑踩过两次）。 */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg' };

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
const userDir = join(root, '.chrome-mob');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9901',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9901/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const reqs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.responseReceived' && /\.webm|\.mp4/.test(m.params.response.url)) {
      reqs.push(m.params.response.url.split('/').pop());
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

  /* 真·手机模拟：iPhone 尺寸、触摸、DPR 3、限制 CPU。
     另外把 hardwareConcurrency 和 deviceMemory 压到手机水平，
     否则 shouldSkipVideo() 会按桌面机的配置判断，测不出真实情况。 */
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 4 });
    ` });

  console.log('\n[手机端实测]  390×844 DPR3 触摸 CPU限速4x\n');

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(1200);

  // 手机要先有一次触摸才允许播（静音视频有些浏览器也要）
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 420 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(4000);

  const st = JSON.parse(await evalJs(`(() => {
    const host = document.getElementById('hero-video');
    const vs = host ? [...host.querySelectorAll('video')] : [];
    return JSON.stringify({
      hostExists: !!host,
      n: vs.length,
      srcs: vs.map((v) => v.getAttribute('src')),
      w: vs.map((v) => v.videoWidth),
      ready: vs.map((v) => v.readyState),
      on: vs.map((v) => v.classList.contains('on')),
      playing: vs.map((v) => !v.paused),
      op: host ? +(+getComputedStyle(host).opacity).toFixed(2) : null,
      skipped: !host,
      title: !!document.getElementById('w-title'),
      goTop: (() => { const g = document.querySelector('.w-go'); if (!g) return null;
        const r = g.getBoundingClientRect(); return [Math.round(innerWidth - r.right), Math.round(r.top)]; })(),
    });
  })()`));
  console.log('  ' + JSON.stringify(st));

  if (st.skipped) {
    bad('手机上视频层被整个移除了 —— 用户要的就是手机也能看');
  } else {
    ok('视频层在（手机也放）');
    const mobile = st.srcs.every((s) => s && /-slim-m\.webm$/.test(s));
    if (mobile) ok('用的是手机小版素材（640×360）');
    else bad('素材不对：' + JSON.stringify(st.srcs));
    if (st.w[0] === 640) ok('解出画面 640px 宽');
    else bad('画面宽度 ' + st.w[0] + '（不是手机版）');
    if (st.on[0] && st.playing[0]) ok('正在播');
    else bad('没在播：on=' + JSON.stringify(st.on) + ' playing=' + JSON.stringify(st.playing));
    if (st.op > 0.9) ok('整屏可见');
    else bad('不可见：' + st.op);
  }
  if (st.title) ok('文字层也在'); else bad('文字层没了');
  if (st.goTop && st.goTop[0] < 100 && st.goTop[1] < 100) ok('入口在右上角 ' + JSON.stringify(st.goTop));
  else bad('入口位置不对：' + JSON.stringify(st.goTop));

  // 等它走一段，确认会切段（不是卡在第一帧）
  const s1 = await evalJs(`(() => { const f = window.__XM_FILM__; return f ? f.state() : null; })()`);
  await sleep(6000);
  const s2 = await evalJs(`(() => { const f = window.__XM_FILM__; return f ? f.state() : null; })()`);
  console.log('       ' + JSON.stringify(s1));
  console.log('   →   ' + JSON.stringify(s2));
  if (s2 && s1 && (s2.t > s1.t || s2.curClip !== s1.curClip)) ok('时钟在走 / 会切段');
  else bad('时钟没动，卡住了');

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome-mobile.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('       shots/welcome-mobile.png');
  console.log('       请求到的视频：' + [...new Set(reqs)].join(', '));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 手机端自检通过\n'));
process.exit(fails ? 1 : 0);
