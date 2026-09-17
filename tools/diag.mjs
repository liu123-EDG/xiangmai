/* 最小诊断：打开页面，报出渲染状态、画布/衬底尺寸、以及所有控制台输出的错误。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9481;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
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
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') logs.push('[console.' + m.params.type + '] ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level !== 'verbose') logs.push('[' + m.params.entry.level + '] ' + m.params.entry.text);
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(3500);

  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.getElementById('gl');
      const b = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      const csBody = getComputedStyle(document.body);
      return JSON.stringify({
        render: document.body.dataset.render,
        stage: document.body.dataset.stage,
        ready: document.body.classList.contains('is-ready'),
        canvasAttr: [c.width, c.height],
        canvasRect: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
        opacity: cs.opacity, display: cs.display, visibility: cs.visibility, zIndex: cs.zIndex,
        bodyBg: csBody.backgroundColor,
        pillarRect: (() => { const p = document.querySelector('.pillar').getBoundingClientRect();
          return [Math.round(p.left), Math.round(p.top), Math.round(p.width), Math.round(p.height)]; })(),
        words: [...document.querySelectorAll('.word')].map(w => w.textContent + ':' + w.classList.toString()).join(' | '),
      }, null, 1);
    })()`, returnByValue: true,
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 1500));
  console.log('--- 控制台 ---');
  if (logs.length === 0) console.log('(无输出)');
  else logs.slice(0, 20).forEach((l) => { fails++; console.log(l.slice(0, 300)); });
  ws.close();
} catch (e) { console.error('错误：' + e.message); fails++; }
finally { chrome.kill(); server.close(); await sleep(200); }
process.exit(fails ? 1 : 0);
