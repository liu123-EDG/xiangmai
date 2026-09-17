/* 把三段烘焙纹理导成 PNG，用于肉眼核对材质。
   用法：node tools/dump-bakes.mjs */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
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
    if (file.endsWith('.html')) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body.toString().replace('</head>', '<script type="module" src="/tools/material-probe-inline.js"></script></head>'));
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9511;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NAMES = ['band1-qon', 'band2-dastan', 'band3-mashrap'];

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
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(5000);

  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__XM_PROBE__ || null)', returnByValue: true,
  });
  const raw = r.result.result.value;
  if (!raw || raw === 'null') { console.log('探针未就绪'); process.exit(1); }

  const imgs = JSON.parse(raw);
  for (let i = 0; i < imgs.length; i++) {
    const buf = Buffer.from(imgs[i].split(',')[1], 'base64');
    await writeFile(join(root, 'shots', NAMES[i] + '.png'), buf);
    console.log('shots/' + NAMES[i] + '.png  ' + Math.round(buf.length / 1024) + ' KB');
  }
  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
