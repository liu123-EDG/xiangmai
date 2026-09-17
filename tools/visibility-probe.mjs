/* 量"圈里到底看得见几个人"—— 逐个查元素的实际渲染结果。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
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
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9671;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(4200);

  // 滚到互动屏
  await evalJs(`(() => { const a = document.getElementById('mq-act');
    window.scrollTo(0, a.offsetTop + a.offsetHeight / 2 - innerHeight / 2); })()`);
  await sleep(700);

  // 加 10 个人（不到满圈，避免庆祝动画干扰观察）
  await evalJs(`(() => { for (let i = 0; i < 10; i++) window.__XM_CIRCLE__.add(); })()`);
  await sleep(1200);

  const report = await evalJs(`(() => {
    const people = [...document.querySelectorAll('.mq__person')];
    const svg = document.querySelector('.mq');
    const out = people.map((g, i) => {
      const r = g.getBoundingClientRect();
      return {
        i,
        tf: g.getAttribute('transform'),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        hop: g.style.getPropertyValue('--hop'),
        hue: g.style.getPropertyValue('--h'),
        headFill: getComputedStyle(g.querySelector('.mq__head')).fill,
        bodyFill: getComputedStyle(g.querySelector('.mq__body')).fill,
      };
    });
    const sr = svg.getBoundingClientRect();
    return JSON.stringify({
      count: window.__XM_CIRCLE__.count,
      svgRect: [Math.round(sr.left), Math.round(sr.top), Math.round(sr.width), Math.round(sr.height)],
      all: out,
    }, null, 1);
  })()`);
  console.log('\n[人员实际状态]\n' + report);

  /* 把自转停掉再截 —— 否则每一帧位置都在变，截到的和量到的不是同一帧。
     减少动效模式下 circle 不启动 rAF，正好用来拍静态图。 */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3800);
  await evalJs(`(() => { const a = document.getElementById('mq-act');
    window.scrollTo(0, a.offsetTop + a.offsetHeight / 2 - innerHeight / 2); })()`);
  await sleep(600);
  await evalJs(`(() => { for (let i = 0; i < 10; i++) window.__XM_CIRCLE__.add(); })()`);
  await sleep(1200);

  const still = await evalJs(`(() => {
    const ps = [...document.querySelectorAll('.mq__person')];
    const svg = document.querySelector('.mq');
    return JSON.stringify({
      n: ps.length,
      // 每个元素的真实屏幕矩形 —— 这才是"看得见看不见"的判据
      boxes: ps.map(g => {
        const r = g.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      }),
      // 逐个取身体的实际颜色
      fills: ps.map(g => getComputedStyle(g.querySelector('.mq__body')).fill),
      bodyCount: document.querySelectorAll('.mq__body').length,
      headCount: document.querySelectorAll('.mq__head').length,
      armCount: document.querySelectorAll('.mq__arm').length,
      peopleGroup: !!document.querySelector('.mq__people'),
      peopleGroupChildren: document.querySelector('.mq__people') ? document.querySelector('.mq__people').children.length : -1,
      svgStyle: getComputedStyle(svg).transform,
      g0: (() => {
        const g = ps[0], cs = getComputedStyle(g);
        return {
          transformBox: cs.transformBox,
          transformOrigin: cs.transformOrigin,
          transform: cs.transform,
          attr: g.getAttribute('transform'),
          animated: g.getAnimations ? g.getAnimations().map(a => a.animationName || a.id) : null,
          bodyTransform: getComputedStyle(g.querySelector('.mq__body')).transform,
          bodyAnim: g.querySelector('.mq__body').getAnimations
            ? g.querySelector('.mq__body').getAnimations().map(a => (a.animationName || '') + ':' + a.playState) : null,
        };
      })(),
    }, null, 1);
  })()`);
  console.log('\n[静止状态]\n' + still);

  /* 截图前立刻再量一次 —— 确认"截到的"和"量到的"是同一帧 */
  const atShot = await evalJs(`(() => {
    const ps = [...document.querySelectorAll('.mq__person')];
    const sc = window.scrollY;
    return JSON.stringify({
      scrollY: Math.round(sc),
      n: ps.length,
      first3: ps.slice(0, 3).map(g => {
        const r = g.getBoundingClientRect();
        return { tf: g.getAttribute('transform'), top: Math.round(r.top), left: Math.round(r.left) };
      }),
    });
  })()`);
  console.log('\n[截图前] ' + atShot);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'mq-visible.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('\n  shots/mq-visible.png');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
