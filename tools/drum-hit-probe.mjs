/* 探一下鼓与三个情绪词的层叠关系：
   ① 鼓面正中点下去，命中的是谁？
   ② 三个情绪词还能不能被点到？
   ③ 鼓的 svg 到底有没有收到 pointer-events（父级是 none）？
   这三点决定"点鼓面就响"能不能做，做之前必须量，不能猜。 */
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
const userDir = join(root, '.chrome-hit');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10491',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10491/json/list')).json();
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
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  const r = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.drum');
    const host = document.querySelector('.drum-host');
    const words = [...document.querySelectorAll('.word')];
    const box = (e) => {
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const sv = svg ? box(svg) : null;
    /* 鼓心正中的命中测试 */
    let hitAtDrum = null;
    if (svg) {
      const b = svg.getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      hitAtDrum = el ? (el.getAttribute('class') || el.tagName) : null;
    }
    return JSON.stringify({
      hasDrum: !!svg,
      drum: sv,
      drumPE: svg ? getComputedStyle(svg).pointerEvents : null,
      hostPE: host ? getComputedStyle(host).pointerEvents : null,
      hostBox: host ? box(host) : null,
      /* **关键**：host 的实际盒子是不是盖住了整个列宽？ */
      hostZ: host ? getComputedStyle(host).zIndex : null,
      hitAtDrum,
      words: words.map((w) => {
        const b = w.getBoundingClientRect();
        const el = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
        return {
          text: w.textContent.trim(),
          box: box(w),
          hit: el ? (el.getAttribute('class') || el.tagName) : null,
          /* 点下去真的能到它自己吗 */
          reachable: el === w || (el && w.contains(el)),
        };
      }),
    });
  })()`));

  console.log('\n[鼓与情绪词的层叠]\n');
  console.log('  鼓存在        ' + r.hasDrum);
  console.log('  鼓 svg        ' + JSON.stringify(r.drum));
  console.log('  svg pointer-events  ' + r.drumPE);
  console.log('  host pointer-events ' + r.hostPE + '   z-index ' + r.hostZ);
  console.log('  host 盒子     ' + JSON.stringify(r.hostBox));
  console.log('  鼓心命中      ' + r.hitAtDrum);
  console.log('');
  r.words.forEach((w) => {
    console.log('  词「' + w.text + '」 ' + JSON.stringify(w.box) +
      '  命中=' + w.hit + '  可点=' + w.reachable);
  });

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
