/* 读鼓 SVG 的**计算样式** —— 找为什么前两幕不绘制。 */
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
const userDir = join(root, '.chrome-svgread');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10221',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10221/json/list')).json();
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4400);

  const read = () => evalJs(`(() => {
    const svg = document.querySelector('.drum');
    const host = document.getElementById('drum-host');
    const out = { svg: {}, host: {}, core: {}, skin: {} };
    const g = (el) => {
      if (!el) return null;
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        op: +(+c.opacity).toFixed(3), vis: c.visibility, disp: c.display,
        fill: c.fill, stroke: c.stroke, sw: c.strokeWidth,
        tf: c.transform === 'none' ? 'none' : c.transform.slice(0, 40),
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        cls: el.getAttribute('class') || '',
      };
    };
    out.svg = g(svg);
    out.host = g(host);
    // 鼓面（第一个 circle，fill 是 url(#drumSkin)）
    out.skin = g(svg.querySelector('circle[fill^="url"]'));
    // 中心那个实心圆（fill 是 #xxxxxx）
    out.core = g(svg.querySelector('circle[fill^="#"]'));
    // 三段圈
    out.rings = [...svg.querySelectorAll('.drum-ring')].map((x) => ({
      op: +(+x.getAttribute('opacity')).toFixed(2), r: x.getAttribute('r'),
      stroke: x.getAttribute('stroke'),
    }));
    // 渐变定义在不在
    const grad = document.querySelector('#drumSkin');
    out.grad = grad ? {
      stops: [...grad.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color')),
    } : null;
    out.shift = getComputedStyle(document.documentElement).getPropertyValue('--drum-shift').trim();
    return JSON.stringify(out);
  })()`).then(JSON.parse);

  for (const [label, act] of [['(未选)', null], ['苍劲', 0], ['叙事', 1], ['欢腾', 2]]) {
    if (act !== null) {
      await evalJs(`document.querySelectorAll('.word')[${act}].click()`);
      await sleep(2600);
    }
    const r = await read();
    console.log('\n── ' + label + ' ──');
    console.log('   svg   ' + JSON.stringify(r.svg));
    console.log('   host  ' + JSON.stringify(r.host));
    console.log('   skin  ' + JSON.stringify(r.skin));
    console.log('   core  ' + JSON.stringify(r.core));
    console.log('   rings ' + JSON.stringify(r.rings));
    console.log('   grad  ' + JSON.stringify(r.grad) + '   --drum-shift=' + r.shift);
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
