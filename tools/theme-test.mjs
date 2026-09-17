/* 主题曲自检：第五、附录两页是否真能自动响起来。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const body = await readFile(join(root, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9691;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

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
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 140));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[主题曲·全站自检]');

  for (const [page, name] of [['lishi/index.html', '第五章'], ['fulu/index.html', '附录']]) {
    console.log('\n  ── ' + name + ' ──');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}` });
    await sleep(4200);

    const before = await evalJs(`JSON.stringify({
      hasTheme: !!window.__XM_THEME__,
      ready: window.__XM_THEME__ ? window.__XM_THEME__.ready : null,
      playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
    })`);
    console.log('       交互前 ' + before);

    // 模拟第一次用户手势（滚动）
    await evalJs(`window.dispatchEvent(new Event('scroll'))`);
    await sleep(2200);

    const after = await evalJs(`JSON.stringify({
      playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
      st: window.__XM_THEME__ ? window.__XM_THEME__.state() : null,
      btn: (document.getElementById('sound-toggle') || {}).getAttribute
        ? document.getElementById('sound-toggle').getAttribute('aria-pressed') : null,
      btnText: (document.getElementById('sound-text') || {}).textContent || null,
    })`);
    console.log('       手势后 ' + after);

    const a = JSON.parse(after);
    if (a.playing) ok(name + '：手势后主题曲在播');
    else bad(name + '：手势后主题曲没响');
    if (a.st && a.st.gain > 0) ok(name + '：音量已拉起（gain=' + a.st.gain + '，ctx=' + a.st.ctxState + '）');
    else bad(name + '：音量没起来 ' + JSON.stringify(a.st));
  }

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 4).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 主题曲全站自检通过') + '\n');
process.exit(fails ? 1 : 0);
