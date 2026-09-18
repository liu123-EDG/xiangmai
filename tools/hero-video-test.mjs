/* 首屏概念片自检：视频是否加载、是否循环、滚动时是否让位给结构柱。 */
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
const userDir = join(root, '.chrome-hero');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9781;
/* 无头浏览器默认会给后台页面节流定时器（实测把 17 秒压成 1 秒），
   这两个开关关掉它，否则测不了"等一圈"这种真时间行为。 */
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
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
  let id = 0; const pending = new Map(); const errs = []; const mp4 = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
    if (m.method === 'Network.responseReceived' && /\.mp4/.test(m.params.response.url)) {
      mp4.push(m.params.response.status + ' ' + m.params.response.url.split('/').pop());
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
  const realScroll = async (y) => {
    await evalJs(`window.scrollTo(0, ${y})`);
    await sleep(900);
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  console.log('\n[首屏概念片自检]');

  const st = JSON.parse(await evalJs(`(() => {
    const host = document.getElementById('hero-video');
    const vs = host ? [...host.querySelectorAll('video')] : [];
    return JSON.stringify({
      hasHost: !!host,
      hasClass: document.body.classList.contains('has-hero-video'),
      n: vs.length,
      vs: vs.map(v => ({
        src: v.getAttribute('src') ? v.getAttribute('src').split('/').pop() : null,
        ready: v.readyState, w: v.videoWidth, h: v.videoHeight,
        on: v.classList.contains('on'),
        err: v.error ? v.error.code : null,
      })),
      hostOpacity: host ? getComputedStyle(host).opacity : null,
    });
  })()`));
  console.log('       ' + JSON.stringify(st));

  if (st.hasHost && st.hasClass) ok('概念片层已启用（桌面端）');
  else bad('概念片层没启用：host=' + st.hasHost + ' class=' + st.hasClass);
  if (st.n === 3) ok('三个 video 元素就位'); else bad('video 数量 = ' + st.n);
  if (st.vs[0].w > 0) ok('第一段已解出画面：' + st.vs[0].w + '×' + st.vs[0].h);
  else bad('第一段没画面：ready=' + st.vs[0].ready + ' err=' + st.vs[0].err);
  if (st.vs[0].on) ok('第一段已亮起'); else bad('第一段没亮');
  if (parseFloat(st.hostOpacity) > 0.9) ok('概念片层完全可见（opacity=' + st.hostOpacity + '）');
  else bad('概念片层不可见：' + st.hostOpacity);

  /* 滚下去：视频应当淡出，结构柱应当出来。
     现在是"霸屏"档 —— 让位起点约 1800px、完全消失约 2880px。
     取样位置也得跟着往后挪，否则会量到"还没开始淡"，得出假失败（踩过）。 */
  await realScroll(2200);
  const mid = JSON.parse(await evalJs(`(() => {
    const host = document.getElementById('hero-video');
    return JSON.stringify({
      op: +(+getComputedStyle(host).opacity).toFixed(3),
      gone: document.body.classList.contains('video-gone'),
    });
  })()`));
  console.log('       滚到 2200px：opacity=' + mid.op + ' video-gone=' + mid.gone);
  if (mid.op < 1) ok('滚动后概念片开始淡出（opacity=' + mid.op + '）');
  else bad('滚动后没淡出：' + mid.op);

  await realScroll(2880);
  const far = JSON.parse(await evalJs(`(() => {
    const host = document.getElementById('hero-video');
    const pillar = document.querySelector('.pillar-wrap');
    return JSON.stringify({
      op: +(+getComputedStyle(host).opacity).toFixed(3),
      gone: document.body.classList.contains('video-gone'),
      pillarOp: pillar ? +(+getComputedStyle(pillar).opacity).toFixed(3) : null,
    });
  })()`));
  console.log('       滚到底：' + JSON.stringify(far));
  if (far.op < 0.06) ok('滚到底概念片完全让位（opacity=' + far.op + '）');
  else bad('概念片还占着画面：' + far.op);
  if (far.gone) ok('已切到结构柱阶段（video-gone）');
  else bad('没切阶段');
  if (far.pillarOp > 0.85) ok('结构柱已浮现（opacity=' + far.pillarOp + '）');
  else bad('结构柱没出来：' + far.pillarOp);

  /* 循环：直接拨时钟，而不是干等。
     无头浏览器会把后台页面的定时器节流到近乎停摆，等真实时间等不到 ——
     这里测的是循环逻辑：拨到 6 秒该换第二段，13 秒该换第三段，
     17 秒该回到第一段。 */
  await realScroll(0);
  const seek = async (sec) => {
    await evalJs(`window.__XM_HERO__.seek(${sec})`);
    await sleep(700);
    return JSON.parse(await evalJs('JSON.stringify(window.__XM_HERO__.state())'));
  };

  const l1 = await seek(2);
  console.log('       拨到  2s  ' + JSON.stringify(l1.on) + ' mounted=' + JSON.stringify(l1.mounted));
  if (l1.on[0]) ok('2 秒 → 第一段（壁画）'); else bad('2 秒的段落不对：' + JSON.stringify(l1.on));

  const l2 = await seek(7);
  console.log('       拨到  7s  ' + JSON.stringify(l2.on) + ' mounted=' + JSON.stringify(l2.mounted));
  if (l2.on[1]) ok('7 秒 → 第二段（颜色抽离）'); else bad('7 秒的段落不对：' + JSON.stringify(l2.on));
  if (l2.mounted[1]) ok('第二段素材已按需挂载');
  else bad('第二段没挂载');

  const l3 = await seek(12.5);
  console.log('       拨到 12.5s ' + JSON.stringify(l3.on) + ' mounted=' + JSON.stringify(l3.mounted));
  if (l3.on[2]) ok('12.5 秒 → 第三段（黑场）'); else bad('12.5 秒的段落不对：' + JSON.stringify(l3.on));
  if (l3.mounted[2]) ok('第三段素材已按需挂载');
  else bad('第三段没挂载');

  /* 拨过整圈长度（17.6 秒）才算"绕回来了"。
     拨 16.2 会得出"没接回第一段"的假失败 —— 那还在圈内。 */
  const l4 = await seek(18.4);
  console.log('       拨到 18.4s ' + JSON.stringify(l4.on) + ' t=' + l4.t);
  if (l4.on[0]) ok('过了一圈 → 自动接回第一段（这就是"循环"）');
  else bad('没有接回第一段：' + JSON.stringify(l4.on));
  if (l4.t < 2) ok('时钟已重置（t=' + l4.t + '）');
  else bad('时钟没重置：' + l4.t);

  const loopSt = l4;
  if (loopSt.mounted.every(Boolean)) ok('三段素材都按需挂载了');
  else bad('有素材没挂上：' + JSON.stringify(loopSt.mounted));
  if (loopSt.on[0] || loopSt.on[1] || loopSt.on[2]) ok('循环后画面仍在（没有黑屏）');
  else bad('循环后没有可见的段落 —— 会黑屏');

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'hero-video.png'), Buffer.from(shot.result.data, 'base64'));

  console.log('       mp4 请求 ' + (mp4.length ? [...new Set(mp4)].join(' / ') : '（未记录）'));
  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 首屏概念片自检通过') + '\n');
process.exit(fails ? 1 : 0);
