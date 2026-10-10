/* 节奏台 · 按行命中（用户报的核心问题）
   --------------------------------------------------------------------------
   用户原话：
   「我的鼠标在手鼓的下面才显示手鼓，到了三行下面才到了萨帕伊和铁环，
     而且明显你的感应框在你画的这个实体横线和圆的下面，
     而且萨帕伊前面两个圆点是点不到的，只能点到第三个，关键还没有反应，
     我指的那一行变亮了，还有就是铁环只有到第四个圆那里才会亮，
     而且只能点到第四个」

   根因：第一版**只按横向位置(x)分乐器**，而画面是三条分开的横排。
   图和命中对不上，用户没法预判。

   本脚本改成用**真实鼠标事件**在每条轨道的每一列上点一遍，
   逐格核对：点在铁环那一行的任意位置，出来的都得是「哒」。

   判据：
     ① 三条轨道 × 多个列位置，命中的乐器 == 那一行
     ② 悬停高亮跟的是**行**，不是列
     ③ 一行里每个圆点都点得到（用户说"只能点到第四个"）
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
const userDir = join(root, '.chrome-rowhit');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10571',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10571/json/list')).json();
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

  /* 三条轨道的真实屏幕 y —— 直接读 SVG 元素的位置，不靠换算 */
  const geo = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.rlab__svg');
    const r = svg.getBoundingClientRect();
    const lanes = [...document.querySelectorAll('.rlab__lane')];
    const names = ['手鼓', '萨帕依', '铁环'];
    return JSON.stringify({
      left: Math.round(r.left), top: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      rows: lanes.map(function (t, i) {
        const b = t.getBoundingClientRect();
        return { name: names[i], y: Math.round(b.top + b.height / 2) };
      }),
      /* 每条轨道上，第一个到第四个记号的实际 x（用户说"只能点到第四个"） */
      markX: [0, 1, 2].map(function (ri) {
        const cls = ['.rlab__m--dum', '.rlab__m--sap', '.rlab__m--tek'][ri];
        return [...document.querySelectorAll(cls)].slice(0, 5).map(function (m) {
          const b = m.getBoundingClientRect();
          return Math.round(b.left + b.width / 2);
        });
      }),
    });
  })()`));

  console.log('\n[节奏台 · 按行命中]\n');
  geo.rows.forEach((r, i) => {
    console.log('  ' + r.name.padEnd(5) + ' y=' + String(r.y).padStart(4) +
      '   前五个记号的 x=' + JSON.stringify(geo.markX[i]));
  });
  console.log('');

  /* ---- ① 每行 × 每列：点下去，命中的乐器必须 == 那一行 ---- */
  const SAY = { 手鼓: '咚', 萨帕依: '沙', 铁环: '哒' };
  for (let ri = 0; ri < 3; ri++) {
    const row = geo.rows[ri];
    const expect = SAY[row.name];
    let wrong = 0;
    const detail = [];
    for (const x of geo.markX[ri]) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: row.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: row.y, button: 'left', clickCount: 1 });
      await sleep(340);
      const judge = await evalJs(`window.__XM_LAB__.state().judge`);
      const got = (judge || '').trim().charAt(0);
      detail.push(got || '·');
      if (got !== expect) wrong++;
    }
    if (wrong === 0) {
      ok(row.name + ' 那一行：5 个位置全出「' + expect + '」' +
        '（' + detail.join('') + '）');
    } else {
      bad(row.name + ' 那一行有 ' + wrong + ' 个位置出错了：' + detail.join('') +
        '（应该全是「' + expect + '」）');
    }
  }

  /* ---- ② 悬停高亮跟的是行 ---- */
  const hoverRows = [];
  for (let ri = 0; ri < 3; ri++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.markX[ri][2], y: geo.rows[ri].y });
    await sleep(220);
    const cls = await evalJs(`document.querySelector('.rlab').className`);
    hoverRows.push((cls.match(/is-hover-\S+/) || ['无'])[0]);
  }
  const want = ['is-hover-dum', 'is-hover-sapayi', 'is-hover-tek'];
  if (JSON.stringify(hoverRows) === JSON.stringify(want)) {
    ok('悬停高亮跟着行走：' + hoverRows.join(' / '));
  } else bad('悬停高亮不对：' + hoverRows.join(' / ') + '（应为 ' + want.join(' / ') + '）');

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 按行命中 自检通过\n'));
process.exit(fails ? 1 : 0);
