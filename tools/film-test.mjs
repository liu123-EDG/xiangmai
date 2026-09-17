/* 概念片自检：三段是否接上、文字是否在第三段浮现、结尾是否淡出。
   抽帧到 shots/film-*.png 供肉眼确认。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(root, p === '/' ? '/index.html' : p);
    const st = await stat(file);
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'accept-ranges': 'bytes',
    });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-film');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9771;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
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
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
    if (m.method === 'Network.responseReceived' && /\.mp4/.test(m.params.response.url)) {
      errs.push('mp4 ' + m.params.response.status + ' ' + m.params.response.url.split('/').pop());
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/film.html` });
  await sleep(3500);

  console.log('\n[概念片自检]');

  const meta = JSON.parse(await evalJs('window.__XM_FILM__()'));
  console.log('       载入 ' + JSON.stringify(meta.durations));
  if (meta.durations.every((d) => d && d > 4.5)) ok('三段视频都能读到时长了：' + meta.durations.join(' / '));
  else bad('有视频读不到时长：' + JSON.stringify(meta.durations));

  /* 最要紧的一条：视频**真的解码出来了**吗。
     只查 class 会漏掉"路径写错、文件 404、画面全黑"这类问题 —— 踩过。 */
  meta.videos.forEach((v) => {
    const good = v.ready >= 3 && v.w > 0 && !v.err;
    if (good) ok('视频已可播：' + v.src + '  ' + v.w + '×' + v.h + '  ' + v.dur + ' 秒');
    else bad('视频没加载：' + v.src + '  readyState=' + v.ready +
      ' 宽=' + v.w + ' err=' + v.err);
  });
  if (meta.videos.every((v) => v.w > 0)) ok('三段画面尺寸都读到了（说明真的解出来了）');
  else bad('有视频没有画面尺寸 —— 文件没找到或解码失败');

  // 跳到几个关键时刻截图
  /* 注意：截图本身要花时间，所以"跳到的时刻"要比想观察的时刻早一些，
     否则等截图时动画已经走过去了（踩过）。
     截图大约耗 1.3–1.6 秒。 */
  const at = async (sec, name, expectAt) => {
    await evalJs(`window.__XM_JUMP__(${sec})`);
    await sleep(1300);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', name), Buffer.from(s.result.data, 'base64'));
    const st = JSON.parse(await evalJs('window.__XM_FILM__()'));
    st.expect = expectAt;
    st.drift = +(+st.t - expectAt).toFixed(2);
    return st;
  };

  const a = await at(0.5, 'film-1.png', 1.9);  console.log('       第一段 ' + JSON.stringify(a.on) + '  文字 ' + a.textOn + '  (t=' + a.t + ')');
  if (a.on[0] && !a.on[1] && !a.on[2]) ok('第一段（壁画）在放，其余没亮');
  else bad('第 2 秒的场景不对：' + JSON.stringify(a.on));
  if (!a.textOn) ok('这一段还没有文字');
  else bad('文字出现太早');

  const b = await at(6.2, 'film-2.png', 7.6);
  console.log('       第二段 ' + JSON.stringify(b.on) + '  (t=' + b.t + ')');
  if (b.on[1] && !b.on[2]) ok('第二段（颜色抽离）在放');
  else bad('第二段的场景不对：' + JSON.stringify(b.on));

  // 目标观察时刻约 11.0 秒（浮现进行到一半）
  const c = await at(9.7, 'film-3.png', 11.1);
  const blurMid = parseFloat((c.ugFilter.match(/blur\(([\d.]+)px\)/) || [0, 99])[1]);
  console.log('       text层 op=' + c.textOpacity + ' class="' + c.textCls +
    '" 文字="' + c.ugText + '" rect=' + JSON.stringify(c.ugRect));
  console.log('       浮现中 t=' + c.t + '  文字' + c.textOn + '  blur=' + blurMid +
    'px  fade=' + c.fade);
  if (c.textOn) ok('维吾尔文已开始浮现');
  else bad('维吾尔文没出来');
  if (blurMid > 0.5 && blurMid < 19) ok('浮现进行中（blur=' + blurMid + 'px，正在由虚变实）');
  else bad('浮现进度不对：blur=' + blurMid + '（t=' + c.t + '）');

  // 定格段：文字全部就位，且还没开始淡出
  const d = await at(13.0, 'film-4.png', 14.4);
  const blurEnd = parseFloat((d.ugFilter.match(/blur\(([\d.]+)px\)/) || [0, 99])[1]);
  console.log('       定格 t=' + d.t + '  中文' + d.cn + '  英文' + d.lat +
    '  blur=' + blurEnd + '  fade=' + d.fade + '  textOp=' + d.textOpacity);
  if (blurEnd < 0.6) ok('维吾尔文已完全清晰');
  else bad('维吾尔文还没清晰：' + d.ugFilter);
  if (d.cn > 0.8) ok('中文已就位（' + d.cn + '）'); else bad('中文没就位：' + d.cn);
  if (d.lat > 0.8) ok('英文已就位（' + d.lat + '）'); else bad('英文没就位：' + d.lat);
  if (d.fade < 0.2) ok('定格阶段还没开始淡出（fade=' + d.fade + '）');
  else bad('太早淡出：' + d.fade);

  const e = await at(16.0, 'film-5.png', 17.4);
  console.log('       淡出 t=' + e.t + '  fade=' + e.fade);
  if (e.fade > 0.3) ok('正在淡出到黑（' + e.fade + '）'); else bad('没淡出：' + e.fade);

  const mp4 = errs.filter((x) => x.startsWith('mp4'));
  console.log('      视频请求 ' + (mp4.length ? mp4.join(' / ') : '（未记录）'));
  const real = errs.filter((x) => !x.startsWith('mp4'));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((x) => bad(x));

  console.log('\n  截图：shots/film-1.png … film-5.png');
  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 概念片自检通过') + '\n');
process.exit(fails ? 1 : 0);
