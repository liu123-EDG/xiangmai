/* 不同窗口宽度下，导航还剩几格、还能不能点。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9601;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');

  const widths = [1920, 1600, 1440, 1280, 1100, 1000, 900, 800, 700, 600, 480];
  console.log('\n窗口宽   可见格数  首格 x    末格 x+宽   溢出?  品牌可见');
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/qiongnaieman/index.html` });
    await sleep(2600);
    const s = JSON.parse(await evalJs(`(() => {
      const links = [...document.querySelectorAll('.sitelinks a')];
      const vis = links.filter(a => {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.1;
      });
      const nav = document.querySelector('.sitelinks');
      const navR = nav ? nav.getBoundingClientRect() : null;
      const brand = document.querySelector('.brand__name');
      const bR = brand ? brand.getBoundingClientRect() : null;
      return JSON.stringify({
        total: links.length,
        visible: vis.length,
        firstX: vis.length ? Math.round(vis[0].getBoundingClientRect().left) : null,
        lastRight: vis.length ? Math.round(vis[vis.length-1].getBoundingClientRect().right) : null,
        navRight: navR ? Math.round(navR.right) : null,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        brandVisible: bR ? bR.width > 0 : false,
        sitelinksDisplay: nav ? getComputedStyle(nav).display : null,
      });
    })()`));
    const flag = (s.visible < 6 ? '  ← 少了 ' + (6 - s.visible) + ' 格' : '');
    console.log(
      String(w).padStart(6) + '  ' + String(s.visible).padStart(6) + '/6' +
      String(s.firstX).padStart(9) + String(s.lastRight).padStart(11) +
      String(s.overflow ? '是' : '否').padStart(8) +
      String(s.brandVisible ? '是' : '否').padStart(9) + flag
    );
  }
  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
