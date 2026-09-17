/* 跑 tools/loop-probe.js，看音序器在 20 秒里是否持续、均匀地触发。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    if (file.endsWith('.html')) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body.toString().replace('</head>', '<script src="/tools/loop-probe.js" defer></script></head>'));
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9531;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
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
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4000);

  const r = await send('Runtime.evaluate', {
    expression: 'window.__XM_LOOP__ ? window.__XM_LOOP__(20) : Promise.resolve(null)',
    awaitPromise: true, returnByValue: true,
  });
  const raw = r.result.result && r.result.result.value;
  if (!raw) { console.log('探针未就绪'); process.exit(1); }
  const A = JSON.parse(raw);

  console.log('\n[循环诊断] 运行 ' + A.seconds + ' 秒，共触发 ' + A.total + ' 次');
  console.log('最长间隔 ' + A.maxGap + ' 秒');
  if (A.err) console.log('触发时抛错：' + A.err);

  console.log('\n调度器状态（每秒采样）：');
  console.log('  时间    nextT   step  phrase  band  enabled  timer');
  A.probes.forEach((p) => {
    console.log('  ' + String(p.at).padStart(5) + '  ' + String(p.nextT).padStart(6) + '  ' +
      String(p.step).padStart(4) + '  ' + String(p.phrase).padStart(6) + '  ' +
      String(p.band).padStart(4) + '  ' + String(p.enabled).padStart(7) + '  ' + String(p.timerAlive).padStart(5));
  });

  console.log('\n前 6 次触发：');
  A.first.forEach((e) => console.log('  t=' + e.t + '  ' + e.kind + '  band=' + e.band + ' phrase=' + e.phrase + ' step=' + e.step));
  console.log('后 6 次触发：');
  A.last.forEach((e) => console.log('  t=' + e.t + '  ' + e.kind + '  band=' + e.band + ' phrase=' + e.phrase + ' step=' + e.step));

  // 判定
  const half = A.seconds / 2;
  const late = A.last.filter((e) => e.t > half).length;
  console.log('');
  if (A.total === 0) console.log('✗ 一次都没触发 —— 音序器根本没跑起来');
  else if (late === 0) console.log('✗ 后半段一次都没触发 —— 循环确实停了');
  else console.log('✓ 全程持续触发，循环在工作');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
