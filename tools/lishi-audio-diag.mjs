/* 第五章：手势之后配乐为什么没起。
   打点记录 autoPlayOnGesture 那条链路 —— 谁被调了、结果如何。 */
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
const userDir = join(root, '.chrome-lishiaudio');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10341',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
(() => {
  window.__LOG__ = [];
  const L = (m) => { window.__LOG__.push(Date.now() % 100000 + ' ' + m); };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  function Patched(...a) {
    const c = new AC(...a);
    L('AudioContext 创建, state=' + c.state);
    const rs = c.resume.bind(c);
    c.resume = function () {
      L('resume() 调用, state=' + c.state);
      const p = rs();
      if (p && p.then) p.then(() => L('resume() 成功 → ' + c.state))
                        .catch((e) => L('resume() 失败: ' + (e && e.message)));
      return p;
    };
    return c;
  }
  Patched.prototype = AC.prototype;
  window.AudioContext = Patched;
  window.webkitAudioContext = Patched;
  /* scroll 会刷屏（页面滚动时每帧都触发），这里只看真正的手势来源 */
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, () => L('手势: ' + ev), { capture: true, passive: true });
  }
  window.addEventListener('error', (e) => L('错误: ' + e.message));
  const w = window.console.warn;
  window.console.warn = function (...a) { L('warn: ' + a.join(' ').slice(0, 90)); return w.apply(this, a); };
})();
`;

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10341/json/list')).json();
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
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });

  for (const page of ['lishi/index.html', 'dastan/index.html']) {
    /* 带查询串，和 sound-default-test 的条件完全一致 ——
       它就是这么打开页面的（用来绕缓存）。 */
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}?t=${Date.now()}` });
    await sleep(3400);
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 400, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 400, button: 'left', clickCount: 1 });
    await sleep(2600);

    const log = JSON.parse(await evalJs(`JSON.stringify(window.__LOG__ || [])`));
    const st = await evalJs(`(() => {
      const t = window.__XM_THEME__;
      return t && t.state ? JSON.stringify(t.state()) : 'no-theme';
    })()`);
    console.log('\n── ' + page + ' ──');
    log.forEach((l) => console.log('   ' + l));
    console.log('   最终状态 ' + st);
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
