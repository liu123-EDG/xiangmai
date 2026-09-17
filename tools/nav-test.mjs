/* 链接串联实测：从首页出发，靠点击一路走到底，看能不能串起来。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
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
const dbgPort = 9591;
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
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      logs.push(m.params.response.status + ' ' + m.params.response.url);
    }
    if (m.method === 'Page.frameNavigated' && m.params.frame.parentId === undefined) {
      logs.push('→ ' + m.params.frame.url.replace('http://127.0.0.1:' + PORT, ''));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n=== 导航条的可见性与可点性 ===');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/qiongnaieman/index.html` });
  await sleep(3800);

  const nav = JSON.parse(await evalJs(`(() => {
    const bar = document.querySelector('.topbar');
    const br = bar.getBoundingClientRect();
    const bs = getComputedStyle(bar);
    const links = [...document.querySelectorAll('.sitelinks a')].map(a => {
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      // 该点是否真的能被点到
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      return {
        text: a.textContent.trim().slice(0, 14),
        href: a.getAttribute('href'),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        opacity: cs.opacity, vis: cs.visibility, pe: cs.pointerEvents,
        hitIsSelf: hit ? (hit === a || a.contains(hit)) : false,
        hitTag: hit ? hit.tagName + '.' + (hit.className || '') : null,
      };
    });
    return JSON.stringify({
      barPointerEvents: bs.pointerEvents,
      barRect: [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height)],
      barZ: bs.zIndex,
      links,
    }, null, 1);
  })()`));
  console.log('  topbar pointer-events=' + nav.barPointerEvents + ' z=' + nav.barZ + ' rect=' + nav.barRect);
  nav.links.forEach((l) => {
    console.log('  ' + l.text.padEnd(16) + ' href=' + String(l.href).padEnd(28) +
      ' rect=' + l.rect.join(',') + ' pe=' + l.pe + ' 可点=' + l.hitIsSelf + ' 命中=' + l.hitTag);
  });

  console.log('\n=== 真点一遍：从序开始，顺着导航走 ===');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(3600);
  const chain = ['qiongnaieman', 'dastan', 'mashrap', 'lishi', 'fulu'];
  for (const id of chain) {
    const before = await evalJs('location.pathname');
    const okClick = await evalJs(`(() => {
      const a = [...document.querySelectorAll('.sitelinks a')].find(x => (x.getAttribute('href')||'').indexOf('${id}') >= 0);
      if (!a) return 'no-link';
      a.click();
      return 'clicked';
    })()`);
    await sleep(2400);
    const after = await evalJs('location.pathname');
    console.log('  点 ' + id.padEnd(14) + ' ' + okClick.padEnd(10) + before + ' → ' + after +
      (after.indexOf(id) >= 0 ? '  ✓' : '  ✗'));
  }

  console.log('\n=== 页面跳转记录 ===');
  logs.filter((l) => l.startsWith('→')).slice(-8).forEach((l) => console.log('  ' + l));
  const errs = logs.filter((l) => !l.startsWith('→') && !/assets\/img/.test(l));
  console.log('\n=== 网络错误（排除待补图片）===');
  if (!errs.length) console.log('  无');
  else errs.slice(0, 8).forEach((l) => console.log('  ' + l));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
