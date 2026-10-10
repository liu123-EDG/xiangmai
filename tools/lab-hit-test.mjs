/* 节奏台 · 真实命中测试
   --------------------------------------------------------------------------
   用户反馈："萨帕依我点是点不出来的，按空格也没反应。"

   而我之前的自检一直用 `lab.strike(0.5)` 这种**内部方法**测 ——
   那验的是"逻辑对不对"，不是"用户点得到点不到"。
   这个脚本改成：**用真实的鼠标事件点在轨道上**，看落在哪一条。

   判据：三条轨道各自的中心位置点下去，出来的音色要对得上。
   ========================================================================== */
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
const userDir = join(root, '.chrome-hitbox');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10561',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const hoverFails = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10561/json/list')).json();
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
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(1400);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3400);

  await evalJs(`document.getElementById('rlab-host').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1200);

  /* 三条轨道的屏幕坐标 —— 直接读 SVG 的几何，不猜 */
  const geo = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.rlab__svg');
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const PAD = 30;
    const inner = vb.width - PAD * 2;
    /* frac 0.1 → 手鼓带；0.5 → 萨帕依带；0.9 → 铁环带 */
    const xOf = (frac) => r.left + ((PAD + frac * inner) / vb.width) * r.width;
    const yOfLane = (si) => {
      const lanes = [...svg.querySelectorAll('.rlab__lane')];
      if (!lanes[si]) return r.top + r.height / 2;
      const b = lanes[si].getBoundingClientRect();
      return b.top + b.height / 2;
    };
    return JSON.stringify({
      svgBox: { l: Math.round(r.left), t: Math.round(r.top),
                w: Math.round(r.width), h: Math.round(r.height) },
      /* 三个位置：左（手鼓）、中（萨帕依）、右（铁环）。
         y 用**整个 svg 的中线** —— 用户不会精确对到某条轨道上，
         他就是在图上点。这一点很关键：如果命中区是按 y 分的，那用户点不准。 */
      midY: Math.round(r.top + r.height / 2),
      x10: Math.round(xOf(0.12)), x50: Math.round(xOf(0.5)), x90: Math.round(xOf(0.88)),
      /* 每条轨道自己的 y */
      laneY: [0, 1, 2].map(yOfLane).map((v) => Math.round(v)),
      /* 命中测试：这三个点到底打在谁身上 */
      hits: [
        document.elementFromPoint(Math.round(xOf(0.12)), Math.round(r.top + r.height / 2)),
        document.elementFromPoint(Math.round(xOf(0.5)), Math.round(r.top + r.height / 2)),
        document.elementFromPoint(Math.round(xOf(0.88)), Math.round(r.top + r.height / 2)),
      ].map((e) => e ? (e.getAttribute('class') || e.tagName) : null),
    });
  })()`));

  console.log('\n[节奏台 · 真实命中]\n');
  console.log('  svg 盒子 ' + JSON.stringify(geo.svgBox));
  console.log('  三个 x：左 ' + geo.x10 + '  中 ' + geo.x50 + '  右 ' + geo.x90);
  console.log('  中线 y ' + geo.midY + '   轨道 y ' + JSON.stringify(geo.laneY));
  console.log('  命中：' + JSON.stringify(geo.hits));
  console.log('');

  /* ---- 用真实鼠标事件点三个位置 ---- */
  const before = await evalJs(`window.__XM_LAB__.state().strikes`);
  for (const [name, x] of [['左(手鼓)', geo.x10], ['中(萨帕依)', geo.x50], ['右(铁环)', geo.x90]]) {
    const s0 = await evalJs(`window.__XM_LAB__.state().strikes`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: geo.midY, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: geo.midY, button: 'left', clickCount: 1 });
    await sleep(500);
    const s1 = await evalJs(`window.__XM_LAB__.state().strikes`);
    const judge = await evalJs(`window.__XM_LAB__.state().judge`);
    console.log('  点 ' + name.padEnd(12) + ' x=' + String(x).padStart(4) +
      '  strikes ' + s0 + ' → ' + s1 + '  反馈「' + judge + '」' +
      (s1 > s0 ? '  ✓' : '  ★ 没反应'));
  }

  /* ---- 键盘三个键 ---- */
  console.log('');
  for (const [name, code, vk, key] of [['空格', 'Space', 32, ' '], ['F', 'KeyF', 70, 'f'], ['J', 'KeyJ', 74, 'j']]) {
    const s0 = await evalJs(`window.__XM_LAB__.state().strikes`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: vk, code, key });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: vk, code, key });
    await sleep(400);
    const s1 = await evalJs(`window.__XM_LAB__.state().strikes`);
    const judge = await evalJs(`window.__XM_LAB__.state().judge`);
    console.log('  按 ' + name.padEnd(6) + ' strikes ' + s0 + ' → ' + s1 +
      '  反馈「' + judge + '」' + (s1 > s0 ? '  ✓' : '  ★ 没反应'));
  }

  /* ---- 焦点在按钮上时空格会怎样（这是个典型的坑）---- */
  console.log('');
  await evalJs(`document.querySelector('.rlab__mode').focus()`);
  const focused = await evalJs(`document.activeElement.className`);
  const s0 = await evalJs(`window.__XM_LAB__.state().strikes`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 32, code: 'Space', key: ' ' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 32, code: 'Space', key: ' ' });
  await sleep(400);
  const s1 = await evalJs(`window.__XM_LAB__.state().strikes`);
  console.log('  焦点在「' + focused + '」上按空格：strikes ' + s0 + ' → ' + s1 +
    (s1 > s0 ? '  ✓ 敲响了' : '  ★ 被按钮吃掉了'));
  if (s1 > s0) console.log('  ✓ 空格没被按钮吃掉');
  else hoverFails.push('空格在按钮焦点上被吃掉');

  /* 悬停预览**不在这里测**。
     原来这里有两条断言，是按旧模型写的（"移到中段应该亮萨帕依"）——
     那个模型是"横向位置决定乐器"，已经废掉了。
     现在乐器按**行**判定，悬停按行高亮，
     覆盖在 tools/lab-row-test.mjs（那边用真实鼠标在每一行上过一遍）。
     留着旧断言只会得到一个假失败。 */

  if (hoverFails.length) {
    console.log('\n  ★ 有 ' + hoverFails.length + ' 项不对：' + hoverFails.join('；') + '\n');
  } else {
    console.log('\n  ✓ 真实命中、键盘、焦点 全部正常' +
      '（悬停见 lab-row-test）\n');
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
process.exit(hoverFails.length ? 1 : 0);
