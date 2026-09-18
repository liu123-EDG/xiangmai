/* 拍横杠导航：收起和展开两种状态，手机尺寸。 */
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
const userDir = join(root, '.chrome-burger');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9921',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9921/json/list')).json();
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
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/qiongnaieman/index.html` });
  await sleep(3600);

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'nav-closed.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  收起态 shots/nav-closed.png');

  // 点开
  await evalJs(`document.getElementById('nav-burger').click()`);
  await sleep(900);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'nav-open.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  展开态 shots/nav-open.png');

  const st = JSON.parse(await evalJs(`(() => {
    const nav = document.getElementById('site-nav');
    const r = nav.getBoundingClientRect();
    const top = document.querySelector('.topbar').getBoundingClientRect();
    return JSON.stringify({
      navRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      topbarH: Math.round(top.height),
      innerW: innerWidth, innerH: innerHeight,
      overflowsRight: Math.round(r.right - innerWidth),
      overflowsLeft: Math.round(r.left),
      overflowsBottom: Math.round(r.bottom - innerHeight),
      menuItems: [...nav.querySelectorAll('a')].map((a) => a.textContent.trim().split('\\n')[0]),
    });
  })()`));
  console.log('  ' + JSON.stringify(st));
  if (st.overflowsRight <= 0 && st.overflowsBottom <= 0) {
    console.log('  ok   展开的菜单没有超出屏幕');
  } else {
    console.log('  FAIL 菜单超出屏幕：右 ' + st.overflowsRight + ' 下 ' + st.overflowsBottom);
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
