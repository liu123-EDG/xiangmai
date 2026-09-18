/* 拍入口卡片的样子，看它够不够显眼。 */
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
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
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
const userDir = join(root, '.chrome-invite');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9991',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9991/json/list')).json();
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
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(1000);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(3400);

  // 量卡片
  const m = JSON.parse(await evalJs(`(() => {
    const a = document.querySelector('.g-invite');
    if (!a) return JSON.stringify({ err: '没有入口卡片' });
    const r = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    return JSON.stringify({
      w: Math.round(r.width), h: Math.round(r.height),
      border: cs.borderColor, title: a.querySelector('.g-invite__title').textContent.trim(),
      lead: a.querySelector('.g-invite__lead').textContent.trim().replace(/\\s+/g,' '),
      tag: a.querySelector('.g-invite__tag').textContent.trim(),
      goto: a.querySelector('.g-invite__go').textContent.trim(),
      href: a.getAttribute('href'),
    });
  })()`));
  console.log('\n[入口卡片]');
  console.log('  ' + JSON.stringify(m));

  // 滚到卡片，拍一张
  await evalJs(`document.querySelector('.g-invite').scrollIntoView({block:'center'})`);
  await sleep(1400);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'invite-card.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  shots/invite-card.png');

  // 顺带拍悬停态：看它亮起来的样子
  const box = JSON.parse(await evalJs(`(() => {
    const r = document.querySelector('.g-invite').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) });
  })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await sleep(1200);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'invite-hover.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  shots/invite-hover.png（鼠标悬停）');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
