/* 量文字特效：呼吸有没有在动、光泽有没有扫过、背后暖光亮没亮。
   加特效最容易出的问题是"写了但没生效"，所以要量，不靠看。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-fx');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9891',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9891/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(4200);

  console.log('\n[文字特效实测]');

  // 拨到文字最清楚的时刻
  await evalJs(`(() => { window.__XM_FILM__.seek(14.5); window.__XM_PAINT__(14.5); })()`);
  await sleep(900);

  const st = JSON.parse(await evalJs(`(() => {
    const ug = document.getElementById('w-ug');
    const bl = document.getElementById('w-bloom');
    const sh = document.querySelector('.w-title__shine');
    return JSON.stringify({
      hasUg: !!ug, hasBloom: !!bl, hasShine: !!sh,
      ugLive: ug ? ug.classList.contains('is-live') : null,
      ugAnim: ug && ug.getAnimations ? ug.getAnimations().map((a) => a.animationName || '(css)') : [],
      ugShadow: ug ? getComputedStyle(ug).textShadow.length : 0,
      ugColor: ug ? getComputedStyle(ug).color : null,
      bloomOp: bl ? +(+getComputedStyle(bl).opacity).toFixed(2) : null,
      shineOp: sh ? +(+getComputedStyle(sh).opacity).toFixed(2) : null,
      shineClip: sh ? (getComputedStyle(sh).webkitBackgroundClip || getComputedStyle(sh).backgroundClip) : null,
      shineAnim: sh && sh.getAnimations ? sh.getAnimations().map((a) => a.animationName || '(css)') : [],
    });
  })()`));
  console.log('       ' + JSON.stringify(st));

  if (st.hasUg && st.hasBloom && st.hasShine) ok('三层都在（字 / 背后暖光 / 光泽层）');
  else bad('有层缺失：' + JSON.stringify(st));
  if (st.ugLive) ok('呼吸动画已挂上（is-live）');
  else bad('呼吸动画没挂上 —— 字是静止的');
  if (st.ugAnim && st.ugAnim.length) ok('动画在跑：' + st.ugAnim.join(','));
  else bad('没有正在跑的动画');
  if (st.ugShadow > 40) ok('多层光晕已生效（text-shadow ' + st.ugShadow + ' 字符）');
  else bad('光晕太薄：' + st.ugShadow);
  if (st.bloomOp > 0.5) ok('背后暖光亮着（opacity=' + st.bloomOp + '）');
  else bad('背后暖光没亮：' + st.bloomOp);
  if (st.shineClip === 'text') ok('光泽层用文字裁切（background-clip: text）');
  else bad('光泽层裁切不对：' + st.shineClip);
  if (st.shineAnim && st.shineAnim.length) ok('光泽扫动在跑：' + st.shineAnim.join(','));
  else bad('光泽没有动画');

  /* 呼吸是不是真的在变：隔一段时间量两次 text-shadow，值应当不同 */
  const s1 = await evalJs(`getComputedStyle(document.getElementById('w-ug')).textShadow`);
  await sleep(1300);
  const s2 = await evalJs(`getComputedStyle(document.getElementById('w-ug')).textShadow`);
  if (s1 !== s2) ok('呼吸确实在变化（两次取值不同）');
  else bad('两次取值一模一样 —— 动画没跑起来');

  /* 光泽有没有扫过：连续采样它的 background-position */
  const pos = [];
  for (let i = 0; i < 8; i++) {
    pos.push(await evalJs(`getComputedStyle(document.querySelector('.w-title__shine')).backgroundPosition`));
    await sleep(400);
  }
  const uniq = [...new Set(pos)];
  console.log('       光泽位置采样 ' + uniq.length + ' 种：' + uniq.slice(0, 4).join(' | '));
  if (uniq.length > 1) ok('光泽在移动（' + uniq.length + ' 个不同位置）');
  else bad('光泽位置没变过');

  // 拍两张对比，确认亮度真的上去了
  await evalJs(`(() => { window.__XM_FILM__.seek(13.5); window.__XM_PAINT__(13.5); })()`);
  await sleep(900);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome-title.png'), Buffer.from(shot.result.data, 'base64'));

  await evalJs(`(() => { window.__XM_FILM__.seek(16.6); window.__XM_PAINT__(16.6); })()`);
  await sleep(900);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome-end.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('       shots/welcome-title.png / welcome-end.png');

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 文字特效自检通过\n'));
process.exit(fails ? 1 : 0);
