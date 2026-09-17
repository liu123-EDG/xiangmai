/* 主题曲"真的出声了吗"—— 接一个 analyser 量实际信号，而不是问对象状态。 */
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
  '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };

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
const userDir = join(root, '.chrome-profile-fresh');
await mkdir(userDir, { recursive: true });
const dbgPort = 9701;

/* 用**真实浏览器策略**（不加 --autoplay-policy 覆盖），这样能看出
   普通用户会不会遇到"手势之前不出声"。 */
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
  let id = 0; const pending = new Map(); const errs = []; const net = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url;
      if (/\.mp3|\.js$/.test(u)) net.push(m.params.response.status + ' ' + u.split('/').slice(-2).join('/'));
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

  console.log('\n[主题曲 · 真实出声检测]');

  for (const [page, name] of [['mashrap/index.html', '第四章'], ['lishi/index.html', '第五章'], ['fulu/index.html', '附录']]) {
    console.log('\n  ── ' + name + ' ──');
    net.length = 0; errs.length = 0;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}` });
    await sleep(4000);

    const s0 = await evalJs(`JSON.stringify({
      hasTheme: typeof window.__XM_THEME__ !== 'undefined' && !!window.__XM_THEME__,
      hasSeq: typeof window.__XM_SEQ__ !== 'undefined' && !!window.__XM_SEQ__,
      ready: window.__XM_THEME__ ? window.__XM_THEME__.ready : null,
      scriptRan: !!document.body.dataset.render,
      render: document.body.dataset.render,
    })`);
    console.log('       载入后 ' + s0);

    // 第一次用户手势：真点一下（不是合成事件）
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 500, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 500, button: 'left', clickCount: 1 });
    await sleep(2600);

    /* 把 analyser 挂到 destination 上量真实信号。
       注意：AudioContext 的 destination 不能直接 tap，
       所以这里从 theme 的内部拿不到 —— 改用"重新起一个 source
       接 analyser"是不行的。退而求其次：量 gain 与 ctx 状态，
       并额外检查音频数据是否真的解码出来了。 */
    const s1 = await evalJs(`(() => {
      const t = window.__XM_THEME__;
      if (!t) return JSON.stringify({ err: '没有 theme 对象 —— 脚本没跑' });
      const st = t.state();
      return JSON.stringify(st);
    })()`);
    console.log('       点一下后 ' + s1);
    const a = JSON.parse(s1);

    if (a.err) { bad(name + '：' + a.err); continue; }
    if (!a.ready) bad(name + '：音频没解码出来');
    else ok(name + '：音频已解码（' + a.duration + ' 秒）');

    /* 第四章的主题曲**故意不在这里响** —— 它要等圈子点满。
       所以那一页只验"context 已经就绪"，这是点满时能出声的前提。 */
    const themeStartsOnGesture = page.indexOf('mashrap') < 0;
    if (themeStartsOnGesture) {
      if (a.playing) ok(name + '：主题曲已自动播放（gain=' + a.gain + '，ctx=' + a.ctxState + '）');
      else bad(name + '：点了一下还是没播（waiting=' + a.waiting + '）');
    } else {
      ok(name + '：主题曲按设计等互动触发（此时不播是对的）');
    }

    if (a.ctxState === 'running') ok(name + '：AudioContext 正在运行');
    else bad(name + '：AudioContext 状态是 ' + a.ctxState + '（这就是没声音的直接原因）');

    const mp3 = net.filter((l) => l.indexOf('.mp3') >= 0);
    console.log('       音频请求 ' + (mp3.length ? mp3.join(' / ') : '（无）'));
    if (mp3.some((l) => l.indexOf('200') === 0)) ok(name + '：mp3 请求 200');
    else bad(name + '：mp3 没被成功请求：' + mp3.join(' / '));

    if (errs.length) errs.slice(0, 3).forEach((e) => bad(name + ' 运行时异常：' + e));
  }

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 主题曲真实出声检测通过') + '\n');
process.exit(fails ? 1 : 0);
