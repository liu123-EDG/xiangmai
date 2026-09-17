/* 真实浏览器策略下，逐页量"到底有没有声音"。
   —— 不加 --autoplay-policy 覆盖，用真实输入事件。
   这是用户实际会遇到的条件。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
const userDir = join(root, '.chrome-real');
await mkdir(userDir, { recursive: true });
const dbgPort = 9731;

/* 真实策略：不加 autoplay 覆盖，也不加 mute */
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('    ok   ' + m);
const bad = (m) => { fails++; console.log('    FAIL ' + m); };

const PAGES = [
  ['mashrap/index.html', '第四章', 'interact'],
  ['dastan/index.html', '第三章', 'scroll'],
  ['lishi/index.html', '第五章', 'scroll'],
  ['fulu/index.html', '附录', 'scroll'],
];

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
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 160));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') {
      errs.push('[warn] ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 140));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const realClick = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[真实策略下的声音检测]');

  for (const [page, name] of PAGES) {
    console.log('\n  ── ' + name + ' ──');
    errs.length = 0;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}` });
    await sleep(4200);

    // 真实点击一次（在空白处，避免触发别的交互）
    await realClick(200, 300);
    await sleep(2800);

    const s = JSON.parse(await evalJs(`(() => {
      const out = {
        hasTheme: !!window.__XM_THEME__,
        hasSeq: !!window.__XM_SEQ__,
        seqEnabled: window.__XM_SEQ__ ? window.__XM_SEQ__.enabled : null,
        seqCtx: window.__XM_SEQ__ && window.__XM_SEQ__.ctx ? window.__XM_SEQ__.ctx.state : null,
        theme: window.__XM_THEME__ ? window.__XM_THEME__.state() : null,
        contexts: 0,
      };
      return JSON.stringify(out);
    })()`));
    console.log('       ' + JSON.stringify(s));

    if (!s.hasTheme) { bad(name + '：页面里没有 theme 对象'); continue; }
    if (s.theme.ctxState !== 'running') bad(name + '：AudioContext 是 ' + s.theme.ctxState);
    else ok(name + '：AudioContext running');

    /* 第四章的配乐按设计要等点满圆圈才响，所以分两种判据。 */
    const waitsForGame = page.indexOf('mashrap') >= 0;
    if (waitsForGame) {
      if (!s.theme.playing) ok(name + '：按设计等点满圆圈，此时不播是对的');
      else bad(name + '：还没玩就播了');

      // 把关卡点满，看配乐会不会起来
      const max = await evalJs('window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.max : 0');
      await evalJs(`(() => { for (let i = 0; i < ${max}; i++) window.__XM_CIRCLE__.add(); })()`);
      await sleep(2600);
      const after = JSON.parse(await evalJs(`JSON.stringify({
        count: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.count : -1,
        theme: window.__XM_THEME__.state(),
        playing: window.__XM_THEME__.playing,
      })`));
      console.log('       点满 ' + after.count + ' 人后 ' + JSON.stringify(after.theme));
      if (after.count === max) ok(name + '：圆圈点满 ' + max + ' 人');
      else bad(name + '：圆圈只有 ' + after.count + ' 人');
      if (after.playing) ok(name + '：点满后配乐响起（gain=' + after.theme.gain + '）');
      else bad(name + '：点满后配乐没响（waiting=' + after.theme.waiting + '，ctx=' + after.theme.ctxState + '）');
    } else if (s.theme.playing) {
      ok(name + '：正在播（' + s.theme.url.split('/').pop() + '，gain=' + s.theme.gain + '）');
    } else {
      bad(name + '：没有在播（waiting=' + s.theme.waiting + '）');
    }

    if (errs.length) errs.slice(0, 3).forEach((e) => bad(name + ' ' + e));
  }

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 真实策略下声音正常') + '\n');
process.exit(fails ? 1 : 0);
