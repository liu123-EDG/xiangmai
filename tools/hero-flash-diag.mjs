/* 序章视频排查：一进去就闪一下没了，量清楚每一步的状态。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
    const body = await readFile(join(root, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-flash');
await mkdir(userDir, { recursive: true });
const dbgPort = 9791;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });

  console.log('\n[序章视频排查]');
  await sleep(2600);
  // 先让它播起来
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 450, deltaX: 0, deltaY: -2 });
  await sleep(1800);

  console.log('\n  逐级滚动，看视频在哪个位置消失：');
  console.log('  scrollY   进度p    opacity  可见性     video播放   时刻');
  for (const y of [0, 100, 200, 300, 400, 600, 800, 1200, 1600, 2000]) {
    await evalJs(`window.scrollTo(0, ${y})`);
    await sleep(900);
    const s = JSON.parse(await evalJs(`(() => {
      const host = document.getElementById('hero-video');
      const cs = getComputedStyle(host);
      const hero = document.getElementById('hero');
      const v = host.querySelector('video.on') || host.querySelector('video');
      const d = Math.max(1, hero.offsetHeight - innerHeight);
      return JSON.stringify({
        p: +((window.scrollY - hero.offsetTop) / d).toFixed(3),
        op: +(+cs.opacity).toFixed(3),
        vis: cs.visibility,
        paused: v.paused,
        t: +v.currentTime.toFixed(2),
      });
    })()`));
    console.log('  ' + String(y).padStart(6) + '  ' + String(s.p).padStart(6) +
      '   ' + String(s.op).padStart(6) + '  ' + s.vis.padEnd(9) +
      '  ' + (s.paused ? '暂停' : '播放中') + '  ' + s.t);
  }

  const after = await evalJs(`JSON.stringify(window.__XM_HERO__.state())`);
  console.log('\n  最终内部状态 ' + after);

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
