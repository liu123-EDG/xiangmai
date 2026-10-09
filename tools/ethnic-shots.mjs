/* 拍八族分页 —— 一页一张，看"八个风格"落成什么样。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { HERITAGE } from '../js/lib/heritage-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-ethshot');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10371',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1280,1400', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10371/json/list')).json();
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 1500, deviceScaleFactor: 1, mobile: false });

  /* --hub：拍八音总页面（而不是某一族的档案页） */
  if (process.argv.includes('--hub')) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/heritage/index.html` });
    await sleep(1400);
    await send('Runtime.evaluate',
      { expression: `localStorage.setItem('xiangmai.unlocked.mashrap','1')` });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/heritage/index.html` });
    await sleep(2600);
    /* 先滚到卡片区再拍。
       reveal 是滚动触发的 —— 不滚过去，卡片还是 opacity 0，拍出来一片黑。 */
    await send('Runtime.evaluate', {
      expression: `document.getElementById('hub').scrollIntoView({ block: 'start', behavior: 'instant' })`,
    });
    await sleep(1800);
    const hs = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', 'hub.png'), Buffer.from(hs.result.data, 'base64'));
    console.log('  八音总页面 → shots/hub.png');
    ws.close(); chrome.kill(); server.close();
    process.exit(0);
  }

  /* 只拍指定的几族；不传就拍全部 */
  const want = process.argv.slice(2);
  const list = want.length ? HERITAGE.filter((h) => want.indexOf(h.id) >= 0) : HERITAGE;

  for (const item of list) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/heritage/${item.id}/index.html` });
    await sleep(2400);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const name = 'ethnic-' + item.id + '.png';
    await writeFile(join(root, 'shots', name), Buffer.from(shot.result.data, 'base64'));
    console.log('  ' + item.group.padEnd(7) + ' → shots/' + name);
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
