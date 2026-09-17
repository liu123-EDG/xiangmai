/* 文字浮现自检 + 抽帧：在几个时间点截图，看浮现过程对不对。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

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
const userDir = join(root, '.chrome-text');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9761;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

/** 用 CDP 的虚拟时间把动画快进到指定秒数，然后截图 */
async function shotAt(send, ms, name) {
  await send('Emulation.setVirtualTimePolicy', {
    policy: 'pause', budget: ms,
  });
  await sleep(320 + ms / 8);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', name), Buffer.from(s.result.data, 'base64'));
  return send('Runtime.evaluate', {
    expression: 'window.__XM_TEXTSTATE__()', returnByValue: true,
  }).then((r) => r.result.result.value);
}

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tools/text-reveal.html` });
  await sleep(2400);

  console.log('\n[文字浮现自检]');

  const base = JSON.parse(await evalJs('window.__XM_TEXTSTATE__()'));
  console.log('       初始 ' + JSON.stringify(base));
  if (base.text && base.text.indexOf('مۇقام') >= 0) ok('维吾尔文正确：' + base.text);
  else bad('维吾尔文不对：' + base.text);
  if (base.dir === 'rtl') ok('方向识别为 RTL（连写才会正确）');
  else bad('方向不是 rtl：' + base.dir);

  /* 用 CSS 动画的 currentTime 精确定位到某个时刻再截图 ——
     比 sleep 等真实时间准，也不会受渲染速度影响。 */
  const atTime = async (sec, name) => {
    await evalJs(`(() => {
      const els = document.querySelectorAll('.ug,.bloom,.sweep,.cn,.lat,.rule,#dust');
      els.forEach(el => {
        el.getAnimations().forEach(a => { a.pause(); a.currentTime = ${sec * 1000}; });
      });
      return true;
    })()`);
    await sleep(420);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', name), Buffer.from(s.result.data, 'base64'));
    return JSON.parse(await evalJs('window.__XM_TEXTSTATE__()'));
  };

  const t0 = await atTime(0.4, 'reveal-00.png');
  console.log('       0.4s  ' + JSON.stringify(t0));
  if (!t0.ug.visible) ok('0.4 秒时文字还没出来（黑场）');
  else bad('0.4 秒文字就出现了，太快');

  const t3 = await atTime(3.0, 'reveal-03.png');
  console.log('       3.0s  ' + JSON.stringify(t3));
  if (t3.ug.visible && t3.ug.opacity < 0.75) ok('3.0 秒时正在浮现（opacity=' + t3.ug.opacity + '，仍是虚的）');
  else bad('3.0 秒状态不对：' + JSON.stringify(t3.ug));

  const t8 = await atTime(8.0, 'reveal-08.png');
  console.log('       8.0s  ' + JSON.stringify(t8));
  if (t8.ug.opacity > 0.94) ok('8.0 秒维吾尔文已清晰（opacity=' + t8.ug.opacity + '）');
  else bad('8.0 秒还没清晰：' + t8.ug.opacity);

  const t13 = await atTime(13.0, 'reveal-13.png');
  console.log('      13.0s  ' + JSON.stringify(t13));
  if (t13.cn.visible) ok('13 秒中文已出现');
  else bad('13 秒中文还没出现：' + JSON.stringify(t13.cn));
  if (t13.lat.visible) ok('13 秒英文已出现');
  else bad('13 秒英文还没出现：' + JSON.stringify(t13.lat));

  const t15 = await atTime(15.5, 'reveal-15.png');
  console.log('      15.5s  ' + JSON.stringify(t15));
  if (t15.ug.opacity > 0.95 && t15.cn.opacity > 0.9) ok('15 秒定格稳定');
  else bad('15 秒不稳定');

  console.log('\n  截图：shots/reveal-00.png  03.png  08.png  13.png  15.png');

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 文字浮现自检通过') + '\n');
process.exit(fails ? 1 : 0);
