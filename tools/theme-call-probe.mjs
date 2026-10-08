/* 在 theme.resume 上设断点 —— 不改源码，直接看它有没有被调用、
   以及调用之后发生了什么的真实情况。
   前几轮我在源码里塞打点，结果自己把自己带偏了（有一次编辑没生效，
   我拿 null 当成"函数没被调用"的证据，绕了一大圈）。
   断点是外部观察，不动被测代码。 */
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
const userDir = join(root, '.chrome-bp');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10351',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10351/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
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

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Debugger.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  for (const page of ['lishi/index.html', 'dastan/index.html']) {
    events.length = 0;
    /* ?t= 是 sound-default-test 的做法（绕缓存）。
       这里加上它，是为了对齐两个测试的条件 —— 见文件头的说明。 */
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}?t=${Date.now()}` });
    await sleep(3400);

    /* 在**页面上**找到 theme 对象的 resume / start，用调试器在这个函数对象上设断点。
       这是外部观察：不改被测源码，也不依赖我自己塞的打点。 */
    const handles = JSON.parse(await evalJs(`(() => {
      const t = window.__XM_THEME__;
      if (!t) return JSON.stringify({ err: 'no theme' });
      window.__BP_RESUME__ = t.resume;
      window.__BP_START__ = t.start;
      return JSON.stringify({ hasResume: typeof t.resume, hasStart: typeof t.start });
    })()`));

    if (handles.err) { console.log('\n' + page + '  ' + handles.err); continue; }

    // 用 Debugger 在这个具体函数对象上设断点
    const objResume = await evalJs(`window.__BP_RESUME__`);
    const objStart = await evalJs(`window.__BP_START__`);

    /* CDP 的 setBreakpointOnFunctionCall 需要 objectId，不是值。
       改用简单可靠的办法：直接在 resume/start 外面包一层计时器，
       记录**真实调用**（这也是外部包装，不改源码，但比源码内打点可靠）。 */
    await evalJs(`(() => {
      const t = window.__XM_THEME__;
      window.__CALLS__ = [];
      const wrap = (name) => {
        const orig = t[name];
        if (typeof orig !== 'function' || orig.__wrapped) return;
        const w = function (...a) {
          const rec = { fn: name, args: a, ctxState: null, t: Date.now() % 100000 };
          window.__CALLS__.push(rec);
          try {
            const st = t.state();
            rec.ctxState = st.ctxState;
            rec.playingBefore = st.playing;
          } catch (e) { rec.stateErr = String(e && e.message); }
          let r;
          try { r = orig.apply(t, a); }
          catch (e) { rec.threw = String(e && e.message); throw e; }
          if (r && r.then) {
            r.then((v) => { rec.resolved = v; rec.ctxAfter = t.state().ctxState; })
             .catch((e) => { rec.rejected = String(e && e.message); });
          } else {
            rec.returned = r;
            setTimeout(() => { rec.ctxAfter = t.state().ctxState; }, 400);
          }
          return r;
        };
        w.__wrapped = true;
        t[name] = w;
      };
      wrap('resume'); wrap('start'); wrap('stop'); wrap('wake'); wrap('useContext');
    })()`);

    // 真实手势
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 400, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 400, button: 'left', clickCount: 1 });
    await sleep(3200);

    const calls = JSON.parse(await evalJs(`JSON.stringify(window.__CALLS__ || [])`));
    const st = await evalJs(`JSON.stringify(window.__XM_THEME__.state())`);
    console.log('\n── ' + page + ' ──');
    calls.forEach((c) => console.log('   调用 ' + JSON.stringify(c)));
    console.log('   最终 ' + st);
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
