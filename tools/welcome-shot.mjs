/* 入口页：在"文字最清楚"的那一刻截图。
   不能靠猜等待时间 —— 循环起点不确定，等多久都可能落在第一段。
   做法：轮询文字不透明度，到峰值再拍。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-ws');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9851',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9851/json/list')).json();
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
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(4200);

  /* 轮询到"标题最清楚"的那一刻再拍 —— 比猜等待时间可靠，
     因为循环起点不确定。
     注意：中文那一行已经取消（汉字提到上面当主标题），
     所以判据改成"标题清晰 + 分隔线已展开"。 */
  let best = -1;
  for (let i = 0; i < 120; i++) {
    const s = JSON.parse(await evalJs(`(() => {
      const t = document.getElementById('w-title');
      const ug = t.querySelector('.w-title__ug');
      const ru = t.querySelector('.w-title__rule');
      const f = getComputedStyle(ug).filter;
      return JSON.stringify({
        op: +(+getComputedStyle(ug).opacity).toFixed(3),
        blur: +(f.match(/blur\\(([\\d.]+)px\\)/) || [0, 99])[1],
        rule: parseFloat(ru.style.width) || 0,
      });
    })()`));
    // 打分：标题清晰 + 分隔线展开 = 最好的时刻
    const score = s.op * 2 + (s.rule > 20 ? 1 : 0) + (s.blur < 1 ? 1 : 0);
    if (score > best && s.op > 0.95 && s.rule > 20 && s.blur < 1) {
      best = score;
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(root, 'shots', 'welcome-title.png'), Buffer.from(shot.result.data, 'base64'));
      console.log('  拍到：op=' + s.op + ' blur=' + s.blur + ' 分隔线=' + s.rule.toFixed(1) + 'vmin');
      break;
    }
    await sleep(150);
  }
  if (best < 0) console.log('  没等到文字最清楚的时刻（可能时间轴没走）');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
