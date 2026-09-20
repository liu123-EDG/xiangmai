/* 右下角那四个刻度点：能不能点、点了会不会动。 */
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
const userDir = join(root, '.chrome-dots');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10151',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10151/json/list')).json();
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  console.log('\n[右下角分幕导航]\n');

  const st = JSON.parse(await evalJs(`(() => {
    const nav = document.querySelector('.actnav');
    const dots = [...document.querySelectorAll('#act-dots button')];
    const prev = document.getElementById('act-prev');
    const next = document.getElementById('act-next');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        pe: cs.pointerEvents, op: +(+cs.opacity).toFixed(2),
        vis: cs.visibility, z: cs.zIndex,
      };
    };
    return JSON.stringify({
      navBox: box(nav),
      prevDisabled: prev ? prev.disabled : null,
      nextLabel: next ? next.textContent.trim() : null,
      dots: dots.map((d) => ({
        jump: d.dataset.actJump,
        cur: d.getAttribute('aria-current'),
        box: box(d),
      })),
    });
  })()`));
  console.log('  .actnav ' + JSON.stringify(st.navBox));
  console.log('  上一幕按钮 disabled = ' + st.prevDisabled + '   下一幕 = ' + st.nextLabel);
  st.dots.forEach((d) => console.log('  点 ' + d.jump + '  current=' + d.cur + '  ' + JSON.stringify(d.box)));

  /* 逐点真点（真实鼠标），看 stage 会不会动 */
  console.log('\n  逐个真点：');
  for (const d of st.dots) {
    if (!d.box) { bad('点 ' + d.jump + ' 没有位置信息'); continue; }
    await evalJs('scrollTo(0,0)');
    await sleep(900);
    const before = await evalJs(`document.body.dataset.stage`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d.box.x, y: d.box.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: d.box.x, y: d.box.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: d.box.x, y: d.box.y, button: 'left', clickCount: 1 });
    await sleep(2400);
    const after = await evalJs(`document.body.dataset.stage`);
    const y = await evalJs('Math.round(scrollY)');
    const good = after === d.jump;
    console.log('    ' + (good ? 'ok  ' : '✗   ') + '点 data-act-jump=' + d.jump +
      '  stage ' + before + ' → ' + after + '  y=' + y);
    if (!good) fails++;
  }

  /* 命中测试：那个位置到底是谁在上面 */
  console.log('\n  命中测试（elementFromPoint）：');
  for (const d of st.dots) {
    if (!d.box) continue;
    const hit = await evalJs(`(() => {
      const el = document.elementFromPoint(${d.box.x}, ${d.box.y});
      return el ? el.tagName + '.' + (el.className.baseVal !== undefined
        ? el.className.baseVal : String(el.className)) : '（空）';
    })()`);
    console.log('    jump=' + d.jump + ' → ' + hit);
  }

  /* 三个情绪词：点哪个就该亮哪个。
     **判据要用"哪个词亮着"，不能用"stage 变成几"。**
     我第一版就是拿"stage === i+1"去验，结果和错实现一起错、
     测试全绿而功能是坏的（用户报"苍劲叙事点不到"）。
     亮着的词是用户真正看得见的东西，那才是判据。 */
  console.log('\n  三个情绪词逐一点：');
  for (let i = 0; i < 3; i++) {
    await evalJs('scrollTo(0,0)');
    await sleep(900);
    await evalJs(`document.querySelectorAll('.word')[${i}].click()`);
    await sleep(2600);
    const r = JSON.parse(await evalJs(`(() => {
      const shown = [...document.querySelectorAll('.word')]
        .filter((w) => w.classList.contains('is-shown'))
        .map((w) => w.textContent.trim());
      const d = window.__XM_DRUM__;
      return JSON.stringify({
        stage: document.body.dataset.stage,
        shown: shown.join(',') || '（无）',
        drum: d ? d.state().section : null,
      });
    })()`));
    const want = ['苍劲', '叙事', '欢腾'][i];
    const good = r.shown === want && r.drum === i;
    console.log('    ' + (good ? 'ok  ' : '✗   ') + '点「' + want + '」→ 亮着「' +
      r.shown + '」  鼓 ' + r.drum + '  stage ' + r.stage);
    if (!good) fails++;
  }

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 分幕导航可用\n'));
