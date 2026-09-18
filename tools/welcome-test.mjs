/* 入口页自检：整屏视频是否循环、是否永不让位、进入按钮是否可达。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(root, p === '/' ? '/index.html' : p);
    const st = await stat(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size, 'accept-ranges': 'bytes',
    });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-welcome');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9811;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let id = 0; const pending = new Map(); const errs = []; const net = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (/\.mp4|dist\/welcome/.test(u)) net.push(m.params.response.status + ' ' + u.split('/').pop());
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(4500);

  console.log('\n[入口页自检]');
  const st = JSON.parse(await evalJs(`(() => {
    const host = document.getElementById('hero-video');
    const vs = host ? [...host.querySelectorAll('video')] : [];
    const go = document.querySelector('.w-go');
    return JSON.stringify({
      hasHost: !!host,
      videos: vs.length,
      w: vs.map(v => v.videoWidth),
      ready: vs.map(v => v.readyState),
      on: vs.map(v => v.classList.contains('on')),
      playing: vs.map(v => !v.paused),
      op: host ? +(+getComputedStyle(host).opacity).toFixed(3) : null,
      goHref: go ? go.getAttribute('href') : null,
      goVisible: go ? go.getBoundingClientRect().width > 0 : false,
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 4,
    });
  })()`));
  console.log('       ' + JSON.stringify(st));

  if (st.hasHost) ok('视频层已启用'); else bad('没有视频层');
  if (st.videos === 3) ok('三段 video 就位'); else bad('video 数量 = ' + st.videos);
  if (st.w[0] > 0) ok('第一段已解出画面 ' + st.w[0] + 'px 宽');
  else bad('第一段没画面：ready=' + JSON.stringify(st.ready));
  if (st.on[0]) ok('第一段已亮起'); else bad('第一段没亮');
  if (st.op > 0.95) ok('整屏可见（opacity=' + st.op + '）'); else bad('不可见：' + st.op);
  if (!st.scrollable) ok('这一页不可滚动（视频不会被滚走）');
  else bad('这页竟然能滚，视频会被滚走');

  /* 确认真的在播。
     不能直接比较两次 currentTime —— 每段只有 5.09 秒，
     循环回 0 之后 currentTime 会变小，看起来像"倒退了"（踩过）。
     改用累计播放秒数：所有 video 的 currentTime 之和，加上切段次数。 */
  const tick = () => evalJs(`(() => {
    const vs = [...document.querySelectorAll('#hero-video video')];
    const on = vs.findIndex((v) => v.classList.contains('on'));
    return JSON.stringify({
      on,
      t: vs.map((v) => +v.currentTime.toFixed(2)),
      sum: +vs.reduce((a, v) => a + v.currentTime, 0).toFixed(2),
      playing: vs.map((v) => !v.paused),
    });
  })()`);
  const a1 = JSON.parse(await tick());
  await sleep(2600);
  const a2 = JSON.parse(await tick());
  console.log('       播放 ' + JSON.stringify(a1) + '\n            → ' + JSON.stringify(a2));
  const advanced = a2.sum > a1.sum || a2.on !== a1.on;   // 时间在走，或者已经换段
  if (advanced) ok('视频确实在播（时间在走或已换段）');
  else bad('视频停着没动：' + JSON.stringify(a1) + ' → ' + JSON.stringify(a2));
  if (a1.playing[a1.on]) ok('当前段处于播放状态（未暂停）');
  else bad('当前段是暂停的');

  // 循环：拨时钟到过一圈的位置，应当接回第一段
  const loopSt = await evalJs(`(() => {
    const f = window.__XM_FILM__;
    if (!f || !f.seek) return JSON.stringify({ err: '没有 seek 接口' });
    const a = f.seek(2);   // 第一段
    const b = f.seek(12);  // 第三段
    const c = f.seek(16.2); // 过一圈
    return JSON.stringify({ at2: a.on, at12: b.on, at16: c.on, tAfter: c.t });
  })()`);
  const ls = JSON.parse(loopSt);
  console.log('       循环 ' + loopSt);
  if (ls.at2 && ls.at2[0]) ok('拨到 2 秒 → 第一段');
  else bad('2 秒的段落不对：' + JSON.stringify(ls.at2));
  if (ls.at12 && ls.at12[2]) ok('拨到 12 秒 → 第三段');
  else bad('12 秒的段落不对：' + JSON.stringify(ls.at12));
  if (ls.at16 && ls.at16[0]) ok('过一圈 → 接回第一段（循环成立）');
  else bad('没有接回第一段：' + JSON.stringify(ls.at16));

  // 进入按钮
  if (st.goHref && st.goHref.indexOf('index.html') >= 0) ok('「进入」指向序章：' + st.goHref);
  else bad('「进入」的链接不对：' + st.goHref);
  if (st.goVisible) ok('「进入」可见且可点');
  else bad('「进入」不可见');
  await evalJs(`document.querySelector('.w-go').click()`);
  await sleep(1800);
  const landed = await evalJs('location.pathname');
  if (landed.indexOf('welcome') < 0) ok('点「进入」成功跳到序章：' + landed);
  else bad('点「进入」没跳转：' + landed);

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(3500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('       shots/welcome.png');
  console.log('       资源 ' + [...new Set(net)].join(' / '));

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 入口页自检通过') + '\n');
process.exit(fails ? 1 : 0);
