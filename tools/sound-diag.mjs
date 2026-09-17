/* 查第三章到底在放什么：手鼓音序器是否还活着、声音按钮接到谁身上。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
const userDir = join(root, '.chrome-diag');
await mkdir(userDir, { recursive: true });
const dbgPort = 9721;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
  let id = 0; const pending = new Map(); const hits = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'log') {
      hits.push(m.params.args.map((a) => a.value).join(' '));
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
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dastan/index.html` });
  await sleep(4500);

  console.log('\n[第三章 · 声音归属排查]');

  // 把手鼓的每一次触发都记下来
  await evalJs(`(() => {
    const s = window.__XM_SEQ__;
    window.__HITS__ = [];
    if (s && s._hit) {
      const orig = s._hit.bind(s);
      s._hit = function (kind, t, g, p) { window.__HITS__.push(kind); return orig(kind, t, g, p); };
    }
    return !!s;
  })()`);

  const st = JSON.parse(await evalJs(`JSON.stringify({
    hasSeq: typeof window.__XM_SEQ__ !== 'undefined' && !!window.__XM_SEQ__,
    hasTheme: !!window.__XM_THEME__,
    themeState: window.__XM_THEME__ ? window.__XM_THEME__.state() : null,
    soundBtn: (() => { const b = document.getElementById('sound-toggle'); return b ? b.getAttribute('aria-pressed') : null; })(),
  })`));
  console.log('  载入后 ' + JSON.stringify(st, null, 1));

  /* 盯住 theme.start 被调了几次、每次的结果是什么 ——
     光看最终状态猜不出中间发生了什么。 */
  await evalJs(`(() => {
    const t = window.__XM_THEME__;
    window.__CALLS__ = [];
    const orig = t.start.bind(t);
    // 包装不了内部方法（返回的是闭包），所以改成监听 context 状态
    const c = t.state().ctxState;
    window.__CALLS__.push('before-gesture ctx=' + c + ' ready=' + t.ready);
    return true;
  })()`);

  /* 用**真实输入事件**，不用合成事件。
     dispatchEvent(new Event('scroll')) 不算用户手势，浏览器会拒绝 resume ——
     拿它测会自动得出"没声"的假结论（我在这上面绕过弯路）。 */
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 400 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 400, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 400, button: 'left', clickCount: 1 });
  await sleep(2600);
  const after1 = JSON.parse(await evalJs(`JSON.stringify({
    seqExists: !!window.__XM_SEQ__,
    seqEnabled: window.__XM_SEQ__ ? window.__XM_SEQ__.enabled : null,
    hits: window.__HITS__.length,
    themePlaying: window.__XM_THEME__.playing,
    themeUrl: window.__XM_THEME__.url,
    btn: document.getElementById('sound-toggle').getAttribute('aria-pressed'),
  })`));
  console.log('  滚动后 ' + JSON.stringify(after1));
  console.log('  状态明细 ' + await evalJs(`JSON.stringify(window.__XM_THEME__.state())`));
  console.log('  调用记录 ' + await evalJs(`JSON.stringify(window.__CALLS__)`));

  // 再点一下声音按钮，看会打开谁
  await evalJs(`document.getElementById('sound-toggle').click()`);
  await sleep(2000);
  const after2 = JSON.parse(await evalJs(`JSON.stringify({
    btn: document.getElementById('sound-toggle').getAttribute('aria-pressed'),
    btnText: document.getElementById('sound-text').textContent,
    seqExists: !!window.__XM_SEQ__,
    seqEnabled: window.__XM_SEQ__ ? window.__XM_SEQ__.enabled : null,
    hits: window.__HITS__.length,
    themePlaying: window.__XM_THEME__.playing,
  })`));
  console.log('  第一次点按钮 ' + JSON.stringify(after2));

  // 再点一次：应当关掉音乐
  await evalJs(`document.getElementById('sound-toggle').click()`);
  await sleep(1600);
  const after3 = JSON.parse(await evalJs(`JSON.stringify({
    btn: document.getElementById('sound-toggle').getAttribute('aria-pressed'),
    btnText: document.getElementById('sound-text').textContent,
    themePlaying: window.__XM_THEME__.playing,
  })`));
  console.log('  第二次点按钮 ' + JSON.stringify(after3));

  console.log('\n  → 结论：');
  if (after1.seqExists) console.log('     ✗ 手鼓音序器还在（会放序章鼓点）');
  else console.log('     ✓ 这一页没有手鼓音序器');
  if (after1.hits > 0) console.log('     ✗ 鼓点响了 ' + after1.hits + ' 次');
  else console.log('     ✓ 鼓点没响');
  if (after1.themePlaying) console.log('     ✓ 手势后配乐起播：' + after1.themeUrl);
  else console.log('     ✗ 手势后配乐没播');
  if (!after2.themePlaying) console.log('     ✓ 第一次点按钮 → 关掉配乐');
  else console.log('     ✗ 第一次点按钮没能关掉');
  if (after3.themePlaying) console.log('     ✓ 第二次点按钮 → 配乐重新响起');
  else console.log('     ✗ 第二次点按钮没重新响');
  console.log('     （注意：这里必须用真实输入事件。dispatchEvent 合成的事件');
  console.log('       不算用户手势，resume() 会被浏览器拒绝，会得出假结论。）');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
