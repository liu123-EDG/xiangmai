/* 直接量 melody 的几何：游标在各个 play 上的 x、音符的 x、回调计数。
   前面几轮我一直隔着"读某个元素的 CSS 属性"来判断，
   那读错元素就什么都看不出来。这个探针在页面里**直接调函数**，看真实数字。 */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
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
const userDir = join(root, '.chrome-mgeo');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10521',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10521/json/list')).json();
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
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(3200);

  const r = JSON.parse(await evalJs(`(() => {
    const host = document.querySelector('.melody-host');
    const svg = host ? host.querySelector('svg') : null;
    const playhead = document.querySelector('.melody-playhead') ||
                     (svg ? svg.querySelector('line') : null);
    /* 游标在各 play 上的 x —— 直接问 path，不问样式 */
    const path = svg ? svg.querySelector('path') : null;
    const xs = [];
    if (path && path.getTotalLength) {
      const L = path.getTotalLength();
      for (let k = 0; k <= 10; k++) {
        const pt = path.getPointAtLength(L * k / 10);
        xs.push(Math.round(pt.x));
      }
    }
    return JSON.stringify({
      hasHost: !!host,
      hasSvg: !!svg,
      hostClass: host ? host.className : null,
      svgClass: svg ? svg.getAttribute('class') : null,
      /* --melody-play 到底设在谁身上 */
      playOnHost: host ? getComputedStyle(host).getPropertyValue('--melody-play').trim() : 'no-host',
      playOnSvg: svg ? getComputedStyle(svg).getPropertyValue('--melody-play').trim() : 'no-svg',
      pathLen: path && path.getTotalLength ? Math.round(path.getTotalLength()) : null,
      cursorXs: xs,
      noteX: [...document.querySelectorAll('.mnote')].map(function (g) {
        return Math.round(g.getBoundingClientRect().left);
      }),
      notesFired: (window.__XM_NOTES__ || []).length,
      voicePlayed: window.__XM_VOICE__ ? window.__XM_VOICE__.state().played : null,
    });
  })()`));

  console.log('\n[旋律几何]\n');
  console.log('  host 存在 ' + r.hasHost + '   svg 存在 ' + r.hasSvg);
  console.log('  host class  ' + r.hostClass);
  console.log('  svg  class  ' + r.svgClass);
  console.log('  --melody-play 在 host 上 = "' + r.playOnHost + '"');
  console.log('  --melody-play 在 svg  上 = "' + r.playOnSvg + '"');
  console.log('  path 总长 ' + r.pathLen);
  console.log('  游标 x（play 0→1）：' + r.cursorXs.join(', '));
  console.log('  音符 x（屏幕坐标）：' + r.noteX.join(', '));
  console.log('  已触发 ' + r.notesFired + ' 次，出声 ' + r.voicePlayed + ' 次');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
