/* 「线上一样的问题」——先证明本地构建到底是新是旧。
   关键：**读界面上真正显示的东西**（提示行、哪一行亮、出什么声），
   不读内部状态。用户看的就是这些。

   每一行都点**最左边** —— 旧模型在这里必然出错（左边落进"手鼓"的横向区间），
   新模型（按行）应该全对。 */
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
const userDir = join(root, '.chrome-visible');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10591',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10591/json/list')).json();
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
  await sleep(3600);
  await evalJs(`document.getElementById('rlab-host').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(900);

  /* 浏览器实际执行的是哪一份代码？直接读函数源码 —— 这是最硬的证据 */
  const whichCode = await evalJs(`(() => {
    const src = (window.__XM_LAB__ && window.__XM_LAB__.state) ? window.__XM_LAB__.state.toString() : '';
    return JSON.stringify({
      /* 页面能不能查到"按行判定"留下的痕迹：laneAtY 是内部函数，查不到；
         但可以通过行为反推。这里先看几个可观测的事实。 */
      cueDefault: (document.querySelector('.rlab__cue') || {}).textContent || '',
      how: (document.querySelector('.rlab__how') || {}).textContent || '',
    });
  })()`);
  console.log('\n[本地构建：界面上真实的表现]\n');
  console.log('  提示行默认文案：' + JSON.parse(whichCode).cueDefault);

  const rows = JSON.parse(await evalJs(`(() => {
    const names = ['手鼓', '萨帕依', '铁环'];
    return JSON.stringify([...document.querySelectorAll('.rlab__lane')].map((t, i) => {
      const b = t.getBoundingClientRect();
      return { name: names[i], y: Math.round(b.top + b.height / 2) };
    }));
  })()`));
  console.log('  三条轨道 y：' + rows.map((r) => r.name + '=' + r.y).join('   '));
  console.log('');

  const left = Math.round(await evalJs(`document.querySelector('.rlab__svg').getBoundingClientRect().left + 40`));
  let wrong = 0;
  const want = { 手鼓: '咚', 萨帕依: '沙', 铁环: '哒' };
  for (const r of rows) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: left, y: r.y });
    await sleep(260);
    const hover = await evalJs(`(() => {
      const c = document.querySelector('.rlab').className;
      const h = (c.match(/is-hover-\\S+/) || ['（没亮）'])[0];
      return h + '  ｜  ' + document.querySelector('.rlab__cue').textContent;
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: left, y: r.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: left, y: r.y, button: 'left', clickCount: 1 });
    await sleep(360);
    const judge = await evalJs(`document.querySelector('.rlab__judge').textContent.trim()`);
    const got = judge.charAt(0);
    const good = got === want[r.name];
    if (!good) wrong++;
    console.log('  ' + r.name.padEnd(5) + ' 点最左边(x=' + left + ') → ' +
      (good ? '✓' : '★') + '  出声「' + judge + '」   高亮 ' + hover);
  }

  console.log('');
  if (wrong === 0) {
    console.log('  ✓ 本地构建是**按行判定**的新代码：三行点最左边都出对的声音');
    console.log('     → 线上的问题只能是「Pages 还没更新」或「浏览器缓存」');
  } else {
    console.log('  ★ 本地构建也有 ' + wrong + ' 行不对 —— 代码还没真正改对');
  }
  console.log('');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
