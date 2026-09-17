/* 打开 ?xmdebug=N 页面并截图，用来在"真实截图"这条唯一可信的通道上读回着色器输出。
   用法：node tools/gl-dump.mjs <mode> [outfile]  */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || '6';
const outName = process.argv[3] || ('debug-mode' + mode + '.png');

const chromePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    // 注入 __XM 以便应用暴露探针
    if (file.endsWith('.html')) {
      const probe = '<script>window.__XM={};' +
        (process.env.XM_DPR ? 'window.__XM.forceDpr=' + process.env.XM_DPR + ';' : '') +
        '</script>';
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body.toString().replace('</head>', probe + '</head>'));
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
const dbgPort = 9448 + (Number(mode) % 40);
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--force-device-scale-factor=1', '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

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
  if (!target) throw new Error('no target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?xmdebug=${mode}` });
  await sleep(4200);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', outName), Buffer.from(shot.result.data, 'base64'));

  // 同时报出应用/着色器两侧的对照量
  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.getElementById('gl');
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      const parent = c.parentElement;
      const pr = parent.getBoundingClientRect();
      return JSON.stringify({
        canvasAttr: [c.width, c.height],
        canvasCss: [Math.round(r.width), Math.round(r.height)],
        canvasOffset: [c.offsetWidth, c.offsetHeight],
        style: { position: cs.position, inset: cs.inset, width: cs.width, height: cs.height,
                 display: cs.display, transform: cs.transform, objectFit: cs.objectFit },
        parent: { cls: parent.className, rect: [Math.round(pr.width), Math.round(pr.height)],
                  h: getComputedStyle(parent).height },
        inner: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        render: document.body.dataset.render,
        sizes: (window.__XM && window.__XM.sizes) ? window.__XM.sizes() : null,
      });
    })()`,
    returnByValue: true,
  });
  console.log('shots/' + outName + '  ' + info.result.result.value);
  ws.close();
} catch (e) {
  console.error('错误：' + e.message);
} finally {
  chrome.kill();
  server.close();
  await sleep(200);
}
