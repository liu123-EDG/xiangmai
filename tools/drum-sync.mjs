/* 鼓为什么慢一拍 —— 直接量，不再推理。 */
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
const userDir = join(root, '.chrome-drumsync');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10121',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10121/json/list')).json();
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

  console.log('\n[鼓同步诊断]\n');

  const probe = () => evalJs(`(() => {
    const d = window.__XM_DRUM__;
    const rings = [...document.querySelectorAll('.drum-ring')]
      .map((x) => +(+x.getAttribute('opacity')).toFixed(2));
    const core = document.querySelector('.drum circle[fill^="#"]');
    return JSON.stringify({
      stage: document.body.dataset.stage,
      drumSection: d ? d.state().section : null,
      rings,
      coreFill: core ? core.getAttribute('fill') : null,
      wordShown: [...document.querySelectorAll('.word')]
        .filter((w) => w.classList.contains('is-shown'))
        .map((w) => w.textContent.trim()).join(',') || '（无）',
    });
  })()`).then(JSON.parse);

  for (const p of [0.12, 0.45, 0.90]) {
    await evalJs(`(() => {
      const hero = document.getElementById('hero');
      const d = Math.max(1, hero.offsetHeight - innerHeight);
      scrollTo(0, hero.offsetTop + d * ${p});
    })()`);
    await sleep(2000);
    console.log('  progress ' + p + '  ' + JSON.stringify(await probe()));
  }

  /* 手动调一次 setSection，看它到底动没动 */
  console.log('\n  手动 setSection(2) 试试：');
  await evalJs(`window.__XM_DRUM__.setSection(2)`);
  await sleep(600);
  console.log('    ' + JSON.stringify(await probe()));

  console.log('\n  再 setSection(0)：');
  await evalJs(`window.__XM_DRUM__.setSection(0)`);
  await sleep(600);
  console.log('    ' + JSON.stringify(await probe()));

  /* 用真实滚轮事件滚，模拟用户操作（不是 scrollTo） */
  console.log('\n  真实滚轮滚动：');
  await evalJs('scrollTo(0,0)');
  await sleep(1500);
  for (let k = 0; k < 26; k++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 700, y: 450, deltaX: 0, deltaY: 120,
    });
    await sleep(120);
    if (k % 6 === 5) {
      const r = await probe();
      const y = await evalJs('Math.round(scrollY)');
      console.log('    滚 ' + String(k + 1).padStart(2) + ' 下  y=' + String(y).padStart(5) +
        '  stage ' + r.stage + '  鼓 ' + r.drumSection + '  词 ' + r.wordShown);
    }
  }

  /* 三个词能不能点、点了会不会跳到那一幕、能不能来回切 */
  console.log('\n  三个词来回点：');
  await evalJs(`scrollTo(0, 0)`);
  await sleep(1200);
  const order = [2, 0, 1, 2, 0];   // 乱序点，检验"来回"
  for (const i of order) {
    await evalJs(`document.querySelectorAll('.word')[${i}].click()`);
    await sleep(2200);
    const r = await probe();
    const want = String(i + 1);
    const good = r.stage === want && r.drumSection === i;
    console.log('    ' + (good ? 'ok  ' : '✗   ') + '点「' +
      ['苍劲', '叙事', '欢腾'][i] + '」→ stage ' + r.stage +
      '  鼓 ' + r.drumSection + '  亮的是 ' + r.wordShown);
  }

  /* 键盘可达：词是 button，应该能 Tab 到 */
  const kb = await evalJs(`(() => {
    const w = document.querySelectorAll('.word');
    return JSON.stringify([...w].map((x) => x.tagName));
  })()`);
  console.log('\n  标签名 ' + kb + '（应为 BUTTON，键盘才到得了）');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
