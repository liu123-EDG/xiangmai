/* 抓那条 "negative value is not valid" 的完整堆栈 —— 不再靠猜是谁写的。 */
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
const userDir = join(root, '.chrome-neg');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10141',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 探针：把 SVG 的 r 属性写入包一层，谁写负数就记下堆栈。
   这比读报错猜来源可靠得多。 */
const PROBE = `
(() => {
  window.__NEG__ = [];
  const d = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'setAttribute');
  const orig = SVGElement.prototype.setAttribute;
  SVGElement.prototype.setAttribute = function (name, value) {
    if (name === 'r' && parseFloat(value) < 0) {
      const el = this;
      window.__NEG__.push({
        v: value,
        tag: el.tagName,
        cls: el.getAttribute('class') || '',
        parent: el.parentElement ? (el.parentElement.getAttribute('class') || el.parentElement.tagName) : null,
        stack: (new Error()).stack.split('\\n').slice(1, 6).join(' | '),
      });
    }
    return orig.call(this, name, value);
  };
})();
`;

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10141/json/list')).json();
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  for (const [url, label] of [
    [`http://127.0.0.1:${PORT}/index.html`, '序章'],
    [`http://127.0.0.1:${PORT}/mashrap/index.html`, '第四章'],
  ]) {
    await send('Page.navigate', { url });
    await sleep(3600);
    // 序章：滚一遍；第四章：点几下圆圈
    if (/index\.html$/.test(url)) {
      for (const y of [200, 700, 1300]) {
        await evalJs(`scrollTo(0, ${y})`);
        await sleep(1200);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        await evalJs(`(() => { const c = window.__XM_CIRCLE__; if (c) c.add(); })()`);
        await sleep(400);
      }
    }
    const neg = JSON.parse(await evalJs(`JSON.stringify((window.__NEG__ || []).slice(0, 3))`));
    console.log('\n[ ' + label + ' ]  负半径写入 ' + neg.length + ' 次');
    neg.forEach((n) => {
      console.log('   值 ' + n.v + '   <' + n.tag.toLowerCase() + ' class="' + n.cls + '">');
      console.log('   父层 ' + n.parent);
      console.log('   堆栈 ' + n.stack);
    });
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
