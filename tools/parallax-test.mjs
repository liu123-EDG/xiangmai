/* 视差专项自检：层是否加载、滚动时是否真的位移、场景是否随进度切换。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9631;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      logs.push(m.params.response.status + ' ' + m.params.response.url);
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[视差自检]');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dastan/index.html` });
  await sleep(4500);

  const info = JSON.parse(await evalJs(`(() => {
    const scenes = [...document.querySelectorAll('.px__scene')];
    const layers = [...document.querySelectorAll('.px__layer')];
    const loaded = layers.filter(i => i.complete && i.naturalWidth > 0).length;
    return JSON.stringify({
      scenes: scenes.length,
      layers: layers.length,
      loaded,
      hasClass: document.body.classList.contains('has-parallax'),
      anchorH: (document.getElementById('px-anchor') || {}).offsetHeight,
      bodyH: document.body.scrollHeight,
    });
  })()`));
  console.log('       ' + JSON.stringify(info));

  if (info.scenes === 3) ok('场景 3 个'); else bad('场景数 = ' + info.scenes);
  if (info.layers === 15) ok('层共 15 张'); else bad('层数 = ' + info.layers);
  if (info.loaded === 15) ok('全部层已加载'); else bad('只加载了 ' + info.loaded + '/15 层');
  if (info.hasClass) ok('已启用视差模式'); else bad('未加 has-parallax');
  if (info.anchorH > 2000) ok('进度参照高度 ' + info.anchorH + 'px'); else bad('参照区太矮：' + info.anchorH);

  // 滚到不同位置，看位移与场景透明度是否真的在变
  const samples = [];
  for (const frac of [0.05, 0.2, 0.45, 0.7, 0.95]) {
    await evalJs(`window.scrollTo(0, Math.round(${info.anchorH + 900} * ${frac}))`);
    await sleep(700);
    const s = JSON.parse(await evalJs(`(() => {
      const scenes = [...document.querySelectorAll('.px__scene')];
      const first = scenes[0].querySelector('.px__layer');
      return JSON.stringify({
        scroll: Math.round(window.scrollY),
        op: scenes.map(s => Number(getComputedStyle(s).opacity).toFixed(2)),
        t: first ? first.style.transform : '',
      });
    })()`));
    samples.push(s);
    console.log('       scroll=' + String(s.scroll).padStart(6) +
      '  场景透明度=[' + s.op.join(', ') + ']  layer1 ' + (s.t || '(无)'));
  }

  const moved = samples.some((s, i) => i > 0 && s.t !== samples[0].t);
  if (moved) ok('滚动时层确实在位移'); else bad('层没有位移，视差没生效');

  const switched = samples.some((s) => Number(s.op[1]) > 0.1) && samples.some((s) => Number(s.op[2]) > 0.1);
  if (switched) ok('场景随滚动切换（第 2、3 个场景都亮起过）');
  else bad('场景没有切换，透明度序列：' + JSON.stringify(samples.map((s) => s.op)));

  // 截图存证
  for (const [name, frac] of [['px-1', 0.05], ['px-2', 0.45], ['px-3', 0.9]]) {
    await evalJs(`window.scrollTo(0, Math.round(${info.anchorH + 900} * ${frac}))`);
    await sleep(900);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(root, 'shots', name + '.png'), Buffer.from(shot.result.data, 'base64'));
  }
  console.log('       shots/px-1.png  shots/px-2.png  shots/px-3.png');

  const errs = logs.filter((l) => !/assets\/img\//.test(l));
  if (!errs.length) ok('无资源错误');
  else errs.slice(0, 5).forEach((l) => bad(l));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 视差自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
