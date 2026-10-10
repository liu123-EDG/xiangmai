/* 悬停**真的亮了吗** —— 量屏幕上算出来的样式，不是看加了哪个类。
   --------------------------------------------------------------------------
   上一个自检（lab-row-test）只验了"元素上加了 is-hover-sapayi 这个类"，
   但 CSS 里写的是 is-hover-sap —— 类名对不上，**屏幕上根本不亮**。
   用户一眼就看见了（"绿的那个不亮"），我的测试却全绿。

   教训：看得见的东西要**量最终的渲染结果**（getComputedStyle 的 opacity / fill），
   不能只验"我加了正确的类"。
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
const userDir = join(root, '.chrome-hoverlook');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10601',
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
      const list = await (await fetch('http://127.0.0.1:10601/json/list')).json();
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

  const rows = JSON.parse(await evalJs(`(() => {
    const names = ['手鼓', '萨帕依', '铁环'];
    const keys = ['dum', 'sap', 'tek'];
    return JSON.stringify([...document.querySelectorAll('.rlab__lane')].map((t, i) => {
      const b = t.getBoundingClientRect();
      return { name: names[i], key: keys[i], y: Math.round(b.top + b.height / 2) };
    }));
  })()`));

  console.log('\n[悬停是否真的亮起来（量渲染结果）]\n');
  console.log('  把鼠标放到每一行上，量那一行记号的 opacity 和轨道名的 fill：\n');

  for (const r of rows) {
    /* 先把鼠标移到别处，确保没有残留状态 */
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: r.y });
    await sleep(320);

    /* **量屏幕上算出来的值**，不是看类名 */
    const paint = JSON.parse(await evalJs(`(() => {
      const cls = '.rlab__m--${r.key}';
      const m = document.querySelector(cls);
      const lane = document.querySelectorAll('.rlab__lane')[${rows.indexOf(r)}];
      const others = [...document.querySelectorAll('.rlab__m')].filter(function (x) {
        return !x.classList.contains('rlab__m--${r.key}');
      });
      return JSON.stringify({
        cls: (document.querySelector('.rlab').className.match(/is-hover-\\S+/) || ['无'])[0],
        onOpacity: m ? +(+getComputedStyle(m).opacity).toFixed(2) : null,
        laneFill: lane ? getComputedStyle(lane).fill : null,
        otherMax: others.length
          ? Math.max.apply(null, others.map(function (x) { return +getComputedStyle(x).opacity; }))
          : null,
      });
    })()`));

    /* 亮着 = 这一行 opacity 接近 1，而且比别的行高 */
    const lit = paint.onOpacity >= 0.9;
    const dimmer = paint.otherMax === null || paint.onOpacity > paint.otherMax;
    const laneLit = paint.laneFill && paint.laneFill.indexOf('192') >= 0;   // var(--amber) = #c08a3e
    const good = lit && dimmer;
    console.log('  ' + r.name.padEnd(5) + ' 类=' + paint.cls.padEnd(18) +
      ' 本行 opacity=' + paint.onOpacity +
      '  其它行最高=' + paint.otherMax +
      '  轨道名=' + (laneLit ? '变琥珀色' : '没变') +
      '  ' + (good ? '✓ 亮了' : '★ 没亮'));
    if (!good) bad(r.name + ' 那一行悬停没亮（opacity ' + paint.onOpacity +
      ' vs 其它 ' + paint.otherMax + '）');
    if (!laneLit) bad(r.name + ' 的轨道名没跟着亮（fill=' + paint.laneFill + '）');
  }

  if (!fails) ok('三行悬停都真的亮起来了（本行亮、其它行压暗、轨道名变琥珀色）');

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 悬停高亮 自检通过\n'));
process.exit(fails ? 1 : 0);
