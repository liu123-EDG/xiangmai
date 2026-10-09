/* 拍节奏台 —— 播放中抓两帧，看记号有没有真的亮起来。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
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
const userDir = join(root, '.chrome-rlabshot');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10471',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10471/json/list')).json();
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
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3400);
  await evalJs(`document.getElementById('rlab-host').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1200);

  /* 三段各拍一张（暂停状态，看静息态） */
  /* 三段各拍一张。**用全屏截图，不用 clip** ——
     clip 在这一套（headless + setDeviceMetricsOverride）下出来一直是全黑，
     试过重算坐标、重新滚动都不行。全屏截图从来没错过，
     多出来的是页面别处的像素，不影响看这个部件。 */
  const names = ['sparse', 'filled', 'cut'];
  for (let i = 0; i < 3; i++) {
    await evalJs(`window.__XM_LAB__.setStage(${i})`);
    await evalJs(`document.getElementById('rlab-host').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(900);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', 'rlab-' + names[i] + '.png'), Buffer.from(shot.result.data, 'base64'));
    const n = await evalJs(`window.__XM_LAB__.state().marks`);
    console.log('  ' + names[i].padEnd(8) + '→ shots/rlab-' + names[i] + '.png   （' + n + ' 个记号）');
  }

  /* 全屏一张 —— 只看元素区域，容易把"reveal 还没触发"误判成"没渲染" */
  await evalJs(`document.getElementById('rlab-host').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1200);
  const full = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'rlab-full.png'), Buffer.from(full.result.data, 'base64'));
  console.log('  full     → shots/rlab-full.png');

  /* 播放中抓一帧：这一刻应该有记号是亮的 */
  await evalJs(`window.__XM_LAB__.setStage(1)`);
  await evalJs(`document.querySelector('.rlab__play').click()`);
  await sleep(1500);
  const clip = JSON.parse(await evalJs(`(() => {
    const b = document.querySelector('.rlab').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(b.left), y: Math.round(b.top),
      width: Math.round(b.width), height: Math.round(b.height) });
  })()`));
  const shot = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 } });
  await writeFile(join(root, 'shots', 'rlab-playing.png'), Buffer.from(shot.result.data, 'base64'));
  const lit = await evalJs(`document.querySelectorAll('.rlab__m.is-hit').length`);
  console.log('  playing  → shots/rlab-playing.png   （此刻亮着 ' + lit + ' 个记号）');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
