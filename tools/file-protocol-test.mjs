/* 直接以 file:// 打开页面，看 module 脚本到底跑没跑。
   这个场景必须单独测：本地服务器能跑通不代表双击能跑通。 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9501;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
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
    if (m.method === 'Log.entryAdded') logs.push('[' + m.params.entry.level + '] ' + m.params.entry.text);
    if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' +
      ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled') logs.push('[console.' + m.params.type + '] ' +
      m.params.args.map((a) => a.value || a.description || '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  const url = 'file:///' + join(root, 'index.html').replace(/\\/g, '/');
  console.log('打开：' + url);
  await send('Page.navigate', { url });
  await sleep(4500);

  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.getElementById('gl');
      return JSON.stringify({
        render: document.body.dataset.render,
        stage: document.body.dataset.stage,
        ready: document.body.classList.contains('is-ready'),
        canvasAttr: [c.width, c.height],
        hasTex: document.querySelectorAll('.seg.has-tex').length,
        litSpan: document.querySelectorAll('.seg__lit').length,
      });
    })()`, returnByValue: true,
  });
  const S = JSON.parse(r.result.result.value);
  console.log(JSON.stringify(S, null, 1));

  console.log('--- 控制台 ---');
  const real = logs.filter((l) => !/favicon/i.test(l));
  real.slice(0, 8).forEach((l) => console.log('  ' + String(l).slice(0, 220)));

  const runnable = S.render !== 'pending' && S.hasTex === 3;
  if (runnable) console.log('\n✓ file:// 场景下脚本正常执行');
  else {
    fails++;
    console.log('\n✗ file:// 场景下脚本没有执行完：render=' + S.render + '，烘焙纹理数=' + S.hasTex);
  }
  ws.close();
} catch (e) { console.error('错误：' + e.message); fails++; }
finally { chrome.kill(); await sleep(200); }
process.exit(fails ? 1 : 0);
