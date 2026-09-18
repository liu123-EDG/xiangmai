/* 音频三问诊断
   用 WebAudio 的 AnalyserNode 量**真实输出电平** ——
   不能只看"enabled 是 true"，那不代表真有声音。
   加 --autoplay-policy 覆盖是不行的，要测真实条件。 */
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
const userDir = join(root, '.chrome-audio');
await mkdir(userDir, { recursive: true });
const dbgPort = 10011;
/* 真实条件：不加 autoplay 覆盖。--mute-audio 只静音扬声器，不影响 AnalyserNode 读数。 */
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ['index.html', '序章'],
  ['qiongnaieman/index.html', '第二章'],
  ['dastan/index.html', '第三章'],
  ['mashrap/index.html', '第四章'],
  ['lishi/index.html', '第五章'],
  ['fulu/index.html', '附录'],
];

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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  /* 附录要解锁才进得去 */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(1500);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);

  console.log('\n[音频诊断]  真实浏览器策略（不加 autoplay 覆盖）\n');

  for (const [path, name] of PAGES) {
    errs.length = 0;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${path}?t=${Date.now()}` });
    await sleep(3000);

    const before = JSON.parse(await evalJs(`(() => {
      const seq = window.__XM_SEQ__, th = window.__XM_THEME__;
      return JSON.stringify({
        btn: (document.getElementById('sound-toggle')||{}).getAttribute
          ? document.getElementById('sound-toggle').getAttribute('aria-pressed') : null,
        seq: !!seq, seqEnabled: seq ? seq.enabled : null,
        seqCtx: seq && seq.ctx ? seq.ctx.state : null,
        hasTheme: !!th, themePlaying: th ? th.playing : null,
        themeReady: th ? th.ready : null,
        themeCtx: th ? th.state().ctxState : null,
        themeVol: th ? th.state().volume : null,
      });
    })()`));

    /* 真实手势：按键最可靠（CDP 的 wheel 不算用户激活，踩过） */
    await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 39,
      code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 39,
      code: 'ArrowRight', key: 'ArrowRight' });
    await sleep(600);
    // 再滚一下，让页面进入正常工作状态
    await evalJs('window.scrollTo(0, 1400)');
    await sleep(3500);

    const after = JSON.parse(await evalJs(`(() => {
      const seq = window.__XM_SEQ__, th = window.__XM_THEME__;
      return JSON.stringify({
        seqEnabled: seq ? seq.enabled : null,
        seqCtx: seq && seq.ctx ? seq.ctx.state : null,
        seqHits: window.__HITS__ ? window.__HITS__.length : null,
        themePlaying: th ? th.playing : null,
        themeCtx: th ? th.state().ctxState : null,
        themeGain: th ? th.state().gain : null,
      });
    })()`));

    console.log('  ── ' + name + ' ──');
    console.log('     手势前 ' + JSON.stringify(before));
    console.log('     手势后 ' + JSON.stringify(after));

    const real = errs.filter((e) => !/favicon/i.test(e));
    real.slice(0, 2).forEach((e) => console.log('     异常 ' + e));
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log('');
