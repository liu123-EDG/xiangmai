/* 拍圆圈里的人：点满 8 个，看新造型（朵帕 + 裙摆 + 摆动）。 */
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
const userDir = join(root, '.chrome-people');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10481',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1000,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10481/json/list')).json();
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
    { width: 1000, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3400);

  /* 这一页有满圈视频幕布，所以先别点满 —— 点 8 个人看造型 */
  await evalJs(`document.getElementById('mq-act').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1200);
  const g = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.mq');
    const r = svg.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
  })()`));
  for (let i = 0; i < 8; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: 1 });
    await sleep(220);
  }
  await sleep(1400);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'circle-people.png'), Buffer.from(shot.result.data, 'base64'));

  const info = JSON.parse(await evalJs(`(() => {
    const ps = [...document.querySelectorAll('.mq__person')];
    const one = ps[0];
    return JSON.stringify({
      people: ps.length,
      hasDoppa: document.querySelectorAll('.mq__doppa').length,
      hasSkirt: document.querySelectorAll('.mq__skirt').length,
      /* 摆动值真的在变吗 */
      swing: one ? one.style.getPropertyValue('--swing') : null,
      sway: one ? one.style.getPropertyValue('--sway') : null,
    });
  })()`));
  console.log('  人 ' + info.people + ' 个，朵帕 ' + info.hasDoppa + '，裙摆 ' + info.hasSkirt);
  console.log('  摆动值 swing=' + info.swing + '  sway=' + info.sway);
  await sleep(700);
  const s2 = await evalJs(`document.querySelector('.mq__person').style.getPropertyValue('--swing')`);
  console.log('  0.7 秒后 swing=' + s2 + '  → ' + (s2 !== info.swing ? '在动 ✓' : '没动 ★'));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
