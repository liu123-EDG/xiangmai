/* 入口页文字浮现自检：第三段是否浮出「十二木卡姆」、循环前是否淡掉。 */
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
const userDir = join(root, '.chrome-wt2');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9841;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
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
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(4200);

  console.log('\n[入口页文字浮现自检]');

  const st = JSON.parse(await evalJs(`(() => {
    const t = document.getElementById('w-title');
    const ug = t && t.querySelector('.w-title__ug');
    return JSON.stringify({
      hasTitle: !!t,
      text: ug ? ug.textContent : null,
      dir: ug ? getComputedStyle(ug).direction : null,
      timer: !!window.__XM_FILM__,
    });
  })()`));
  console.log('       ' + JSON.stringify(st));
  if (st.hasTitle) ok('文字层已就位'); else bad('没有文字层');
  if (st.text && st.text.indexOf('مۇقام') >= 0) ok('维吾尔文正确：' + st.text);
  else bad('维吾尔文不对：' + st.text);
  if (st.dir === 'rtl') ok('方向 RTL（连写才正确）'); else bad('方向不是 rtl：' + st.dir);

  /* 按时间轴采样：直接调页面里的 tickTitle 看不到（不是导出函数），
     所以用真实等待 —— 每 1 秒看一眼，覆盖整圈 15.9 秒。 */
  console.log('\n   墙钟   文字op   blur      规则宽   中文op  英文op');
  const seen = { anyText: false, cnSeen: false, faded: false };
  for (let i = 0; i < 19; i++) {
    const s = JSON.parse(await evalJs(`(() => {
      const t = document.getElementById('w-title');
      const ug = t.querySelector('.w-title__ug');
      const ru = t.querySelector('.w-title__rule');
      const cn = t.querySelector('.w-title__cn');
      const la = t.querySelector('.w-title__lat');
      const f = getComputedStyle(ug).filter;
      return JSON.stringify({
        op: +(+getComputedStyle(ug).opacity).toFixed(3),
        blur: (f.match(/blur\\(([\\d.]+)px\\)/) || [0, 0])[1],
        ruleW: ru.style.width,
        cn: +(+cn.style.opacity || 0).toFixed(2),
        lat: +(+la.style.opacity || 0).toFixed(2),
      });
    })()`));
    console.log('   ' + String(i).padStart(3) + 's  ' + String(s.op).padStart(6) +
      '  ' + String(s.blur).padStart(6) + '  ' + String(s.ruleW).padStart(8) +
      '  ' + String(s.cn).padStart(5) + '  ' + String(s.lat).padStart(5));
    if (s.op > 0.5) seen.anyText = true;
    if (s.cn > 0.5) seen.cnSeen = true;
    if (seen.anyText && s.op < 0.2) seen.faded = true;
    await sleep(1000);
  }

  if (seen.anyText) ok('维吾尔文浮现过'); else bad('维吾尔文一直没出现');
  if (seen.cnSeen) ok('中文也出现过'); else bad('中文没出现');
  if (seen.faded) ok('循环前淡掉了（不会硬切）'); else bad('没看到淡出');

  // 抓一张文字最清楚的时候
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(4200);
  await sleep(13000);   // 等到第三段文字就位
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome-title.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('       shots/welcome-title.png');

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 文字浮现自检通过') + '\n');
process.exit(fails ? 1 : 0);
