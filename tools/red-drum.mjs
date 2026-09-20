/* 给鼓加一圈刺眼的东西，看它到底画不画。
   样式读数全对却不绘制 —— 那就是绘制阶段的问题，不是属性问题。 */
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
const userDir = join(root, '.chrome-red');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10231',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10231/json/list')).json();
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

  /* 切到"苍劲"，然后：
     ① 给整个 .drum-host 加红底 —— 测这一层画不画
     ② 给 .drum 加红边 —— 测 SVG 画不画
     ③ 再往 .column-layer 里塞一个普通 div —— 测这个容器画不画 */
  await evalJs(`document.querySelectorAll('.word')[0].click()`);
  await sleep(2600);

  for (const [label, js] of [
    ['① .drum-host 加红底', `document.getElementById('drum-host').style.background = 'red'`],
    ['② .drum 加红边', `document.querySelector('.drum').style.outline = '6px solid lime'`],
    ['③ .column-layer 里塞个 div', `(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:40px;top:40px;width:200px;height:60px;background:magenta;z-index:99';
        d.textContent = 'TEST';
        document.querySelector('.column-layer').appendChild(d);
      })()`],
    ['④ 把 .column-layer 提到 z-index 50', `document.querySelector('.column-layer').style.zIndex = '50'`],
    ['⑤ 鼓挪到视口正中 (fixed)', `(() => {
        const h = document.getElementById('drum-host');
        h.style.position = 'fixed';
        h.style.left = '50%'; h.style.top = '50%';
        h.style.zIndex = '999';
      })()`],
  ]) {
    await evalJs(js);
    await sleep(1100);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', 'red-' + label.slice(0, 1) + '.png'),
      Buffer.from(shot.result.data, 'base64'));
    const info = await evalJs(`(() => {
      const h = document.getElementById('drum-host');
      const r = h.getBoundingClientRect();
      // 命中测试：鼓中心那个点，最上面是谁
      const el = document.elementFromPoint(Math.round(r.left + r.width / 2),
                                           Math.round(r.top + r.height / 2));
      return JSON.stringify({
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width)],
        bg: getComputedStyle(h).backgroundColor,
        hit: el ? (el.tagName + (el.id ? '#' + el.id : '') + '.' +
              (el.className.baseVal !== undefined ? el.className.baseVal : String(el.className)).split(' ')[0]) : '（空）',
      });
    })()`);
    console.log(label.padEnd(30) + '  → ' + info + '   shots/red-' + label.slice(0, 1) + '.png');
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
