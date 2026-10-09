/* 把 section 的绝对位置和 play 的关系量清楚。
   前面几轮我一直在"算"滚动位置，算错好几次。
   这次直接**扫一遍**：从 section 上方滚到它下方，每 150px 读一次 play 和游标 x。
   数据摆出来，范围自然就有了。 */
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
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-mscan');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10531',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10531/json/list')).json();
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
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(3200);
  /* 先给一次真实手势，让 audio 有 context */
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 500, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 500, button: 'left', clickCount: 1 });
  await sleep(400);

  const g = JSON.parse(await evalJs(`(() => {
    const s = document.getElementById('melody-act');
    const r = s.getBoundingClientRect();
    const curve = document.querySelector('.melody__curve');
    return JSON.stringify({
      absTop: Math.round(window.scrollY + r.top),
      height: Math.round(r.height),
      vh: window.innerHeight,
      scrollMax: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      pathLen: curve ? Math.round(curve.getTotalLength()) : null,
    });
  })()`));
  console.log('\n[扫一遍：scrollY → play → 游标 x → 已触发]\n');
  console.log('  section 绝对顶部 ' + g.absTop + '，高 ' + g.height +
    '，视口 ' + g.vh + '，可滚到 ' + g.scrollMax + '，路径长 ' + g.pathLen);
  console.log('');

  const from = Math.max(0, g.absTop - g.vh - 200);
  const to = Math.min(g.scrollMax, g.absTop + g.height + 200);
  const rows = [];
  for (let y = from; y <= to; y += 150) {
    await evalJs(`window.scrollTo({ top: ${y}, behavior: 'instant' })`);
    await sleep(130);
    const row = JSON.parse(await evalJs(`(() => {
      const svg = document.querySelector('.melody');
      const curve = document.querySelector('.melody__curve');
      const head = document.querySelector('.melody__playhead');
      const tf = head ? (head.getAttribute('transform') || '') : '';
      const mx = /translate\\(([-\\d.]+)/.exec(tf);
      return JSON.stringify({
        play: svg ? getComputedStyle(svg).getPropertyValue('--melody-play').trim() : '?',
        cursorX: mx ? Math.round(parseFloat(mx[1])) : null,
        fired: (window.__XM_NOTES__ || []).length,
        played: window.__XM_VOICE__ ? window.__XM_VOICE__.state().played : null,
      });
    })()`));
    rows.push({ y, ...row });
  }

  rows.forEach((r) => {
    console.log('  y=' + String(r.y).padStart(5) +
      '  play=' + String(r.play).padEnd(7) +
      '  游标x=' + String(r.cursorX).padStart(5) +
      '  触发=' + String(r.fired).padStart(2) +
      '  出声=' + String(r.played).padStart(2));
  });

  const maxPlay = Math.max(...rows.map((r) => parseFloat(r.play) || 0));
  const maxFired = Math.max(...rows.map((r) => r.fired));
  console.log('\n  play 最大 ' + maxPlay.toFixed(3) + '，触发最多 ' + maxFired + ' 次');
  if (maxPlay < 0.99) console.log('  ★ play 从来没到 1 —— 滚动范围不够，或者公式的分母不对');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
