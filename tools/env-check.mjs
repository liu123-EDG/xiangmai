/* 先确认测试环境本身对不对 —— 视口、DPR、截图尺寸。
   前面几轮我可能一直在拿错尺寸的截图上做像素分析。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
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
const userDir = join(root, '.chrome-env');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10261',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10261/json/list')).json();
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
  const pngSize = (b64) => {
    const b = Buffer.from(b64, 'base64');
    return { W: b.readUInt32BE(16), H: b.readUInt32BE(20), bytes: b.length };
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4000);

  console.log('\n[测试环境核对]\n');
  console.log('   页面自报 ' + await evalJs(`JSON.stringify({
    iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
    sw: document.documentElement.clientWidth,
    sh: document.documentElement.clientHeight,
  })`));

  const full = await send('Page.captureScreenshot', { format: 'png' });
  console.log('   全屏截图 ' + JSON.stringify(pngSize(full.result.data)));

  /* 顶栏的实际位置 —— 用它在截图里定位，就能判断坐标系 */
  const nav = JSON.parse(await evalJs(`(() => {
    const b = document.querySelector('.topbar');
    const r = b ? b.getBoundingClientRect() : null;
    return JSON.stringify(r ? { x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) } : null);
  })()`));
  console.log('   顶栏 rect ' + JSON.stringify(nav));

  /* 按顶栏的坐标截一小条 —— 如果坐标系对，截出来应该是顶栏 */
  const strip = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: nav.x, y: nav.y, width: Math.min(600, nav.w), height: Math.max(8, nav.h), scale: 1 },
  });
  console.log('   按顶栏坐标截一条 ' + JSON.stringify(pngSize(strip.result.data)));
  await writeFile(join(root, 'shots', 'env-strip.png'),
    Buffer.from(strip.result.data, 'base64'));

  /* 再截鼓那一块 */
  const drum = JSON.parse(await evalJs(`(() => {
    const d = document.querySelector('.drum').getBoundingClientRect();
    return JSON.stringify({ x: Math.floor(d.left), y: Math.floor(d.top),
      w: Math.ceil(d.width), h: Math.ceil(d.height) });
  })()`));
  const dshot = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: drum.x, y: drum.y, width: drum.w, height: drum.h, scale: 1 },
  });
  console.log('   鼓 rect ' + JSON.stringify(drum) + '  → 截图 ' + JSON.stringify(pngSize(dshot.result.data)));
  await writeFile(join(root, 'shots', 'env-drum.png'), Buffer.from(dshot.result.data, 'base64'));

  /* 全屏截图里，顶栏应该在 y≈0~56 */
  await writeFile(join(root, 'shots', 'env-full.png'), Buffer.from(full.result.data, 'base64'));
  console.log('\n   shots/env-full.png / env-strip.png / env-drum.png');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
