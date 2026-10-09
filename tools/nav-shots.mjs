/* 拍底部导航 —— 改大之后不能变丑。 */
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
const userDir = join(root, '.chrome-navshot');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10451',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1280,760', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10451/json/list')).json();
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

  const SHOTS = [
    ['dastan/index.html', 'nav-chapter.png', '1440x900', '章末按钮（第三章）'],
    ['mashrap/index.html', 'nav-actnav.png', '1440x900', '分幕导航（第四章右下角）'],
    ['dastan/index.html', 'nav-mobile.png', '390x844', '手机上的章末按钮'],
  ];

  for (const [path, out, vp, desc] of SHOTS) {
    const [w, h] = vp.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${path}` });
    await sleep(1500);
    await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${path}` });
    await sleep(2800);
    await evalJs(`document.querySelector('.chapter-nav, .actnav').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(1000);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', out), Buffer.from(shot.result.data, 'base64'));
    console.log('  ' + desc.padEnd(24) + vp.padEnd(10) + '→ shots/' + out);
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
