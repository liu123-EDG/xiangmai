/* 拍序章那只手鼓，看它是不是真的在敲。 */
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
const userDir = join(root, '.chrome-drum');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10071',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10071/json/list')).json();
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
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 160));
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
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  /* 概念片霸屏档：要滚过让位区间才看得到鼓 */
  await evalJs('window.scrollTo(0, 2880)');
  await sleep(2600);

  const probe = () => evalJs(`(() => {
    const d = window.__XM_DRUM__;
    const el = document.querySelector('.drum');
    const r = el ? el.getBoundingClientRect() : null;
    return JSON.stringify({
      hasDrum: !!d,
      size: r ? [Math.round(r.width), Math.round(r.height)] : null,
      center: r ? [Math.round(r.left + r.width/2), Math.round(r.top + r.height/2)] : null,
      state: d ? d.state() : null,
      arcs: [...document.querySelectorAll('.drum path')].map((p) => +(+p.getAttribute('opacity')).toFixed(2)),
      stages: document.body.dataset.stage,
      render: document.body.dataset.render,
    });
  })()`).then(JSON.parse);

  console.log('\n[序章 · 手鼓]\n');
  const a = await probe();
  console.log('  挂上了吗 ' + a.hasDrum + '   尺寸 ' + JSON.stringify(a.size) +
    '   中心 ' + JSON.stringify(a.center));
  console.log('  渲染后端 ' + a.render + '   当前 stage ' + a.stages);
  console.log('  三段弧的不透明度 ' + JSON.stringify(a.arcs));
  console.log('  状态 ' + JSON.stringify(a.state));

  /* 敲不敲：连续采样，看涟漪数量（有涟漪=正在敲） */
  const seen = [];
  for (let i = 0; i < 10; i++) {
    await sleep(400);
    const s = await probe();
    seen.push(s.state.ripples);
  }
  console.log('\n  涟漪数采样（十次）' + JSON.stringify(seen));
  if (seen.some((n) => n > 0)) console.log('  ✓ 在敲（有涟漪荡出来）');
  else console.log('  ✗ 没在敲');

  /* 段号跟着 stage 走吗 */
  for (const st of [1, 2, 3]) {
    await evalJs(`document.body.dataset.stage = '${st}'`);
    await sleep(700);
    const s = await probe();
    console.log('  stage=' + st + ' → 鼓在第 ' + (s.state.section + 1) + ' 段，弧 ' + JSON.stringify(s.arcs));
  }

  await evalJs(`document.body.dataset.stage = '3'`);
  await sleep(600);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'drum-look.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('\n  shots/drum-look.png');

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (real.length) real.slice(0, 3).forEach((e) => console.log('  异常 ' + e));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
