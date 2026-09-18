/* 第四章 · 用**真实鼠标点击**点满 16 下，量主题曲有没有响。
   为什么要单独测：之前只用 js 直接调 add() 验证，
   那条路和"用户一下下点"不完全一样（每次点击都触发了手势逻辑）。
   用户报的正是"点完 16 下还是没有那段 30 秒音乐"。 */
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
const userDir = join(root, '.chrome-real4');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10051',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  window.__NODES__ = [];
  function Patched(...a) {
    const ctx = new AC(...a);
    const g0 = ctx.createGain.bind(ctx);
    ctx.createGain = function () {
      const g = g0();
      let tag = 'other';
      try {
        const st = (new Error()).stack || '';
        if (/playBuffer/.test(st)) tag = 'theme';
        else if (/sequencer|_tick|voice/i.test(st)) tag = 'seq';
      } catch (e) {}
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      const buf = new Float32Array(an.fftSize);
      const node = { tag, peak: 0 };
      window.__NODES__.push(node);
      try { g.connect(an); } catch (e) {}
      const rec = () => {
        try {
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          const r = Math.sqrt(s / buf.length);
          if (r > node.peak) node.peak = +r.toFixed(5);
        } catch (e) {}
        setTimeout(rec, 150);
      };
      rec();
      return g;
    };
    return ctx;
  }
  Patched.prototype = AC.prototype;
  window.AudioContext = Patched;
  window.webkitAudioContext = Patched;
})();
`;

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10051/json/list')).json();
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
  const levels = () => evalJs(`(() => {
    const n = window.__NODES__ || [];
    const mx = (t) => n.filter((x) => x.tag === t).reduce((a, x) => Math.max(a, x.peak), 0);
    return JSON.stringify({ theme: mx('theme'), seq: mx('seq'), nodes: n.length });
  })()`).then(JSON.parse);
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(3600);

  // 把圆圈滚到视野中间，拿到它的屏幕坐标
  const geo = JSON.parse(await evalJs(`(() => {
    const a = document.getElementById('mq-act');
    a.scrollIntoView({ block: 'center' });
    return JSON.stringify({ actTop: Math.round(a.getBoundingClientRect().top) });
  })()`));
  await sleep(1200);
  const spot = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.mq__svg') || document.querySelector('#mq-host svg');
    if (!svg) return JSON.stringify({ err: '找不到圆圈的 svg' });
    const r = svg.getBoundingClientRect();
    return JSON.stringify({
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  })()`));

  console.log('\n[第四章 · 真实点击 16 下]\n');
  if (spot.err) { console.log('  ' + spot.err); }
  console.log('  圆圈中心 (' + spot.x + ', ' + spot.y + ')  尺寸 ' + spot.w + '×' + spot.h);
  console.log('  点之前 ' + JSON.stringify(await levels()));

  /* 一下一下真点。每次点完等一会，模拟人的节奏。 */
  for (let i = 1; i <= 18; i++) {
    await click(spot.x, spot.y);
    await sleep(420);
    if (i % 6 === 0 || i === 18) {
      const st = JSON.parse(await evalJs(`JSON.stringify({
        count: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.count : null,
        playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
        ctx: window.__XM_THEME__ ? window.__XM_THEME__.state().ctxState : null,
      })`));
      console.log('  点 ' + String(i).padStart(2) + ' 下  ' + JSON.stringify(st));
    }
  }

  await sleep(3500);
  const after = await levels();
  console.log('\n  点满后峰值 ' + JSON.stringify(after));
  console.log('   → 配乐 ' + (after.theme > 0.001 ? '有声 ✓' : '没声 ✗'));
  console.log('   → 手鼓 ' + (after.seq > 0.001 ? '有声 ✓' : '没声 ✗'));

  /* 峰值不代表"听得到" —— 鼓是脉冲式的，峰值高但平均低；
     配乐是持续的。所以要量**稳态平均**，才能回答
     "是不是鼓把配乐盖住了"（用户报的正是"只听到鼓"）。 */
  const steady = JSON.parse(await evalJs(`(() => {
    window.__NODES__.forEach((n) => { n.peak = 0; });
    return JSON.stringify({ reset: true });
  })()`));
  await sleep(6000);
  const avg = JSON.parse(await evalJs(`(() => {
    const n = window.__NODES__ || [];
    const mx = (t) => n.filter((x) => x.tag === t).reduce((a, x) => Math.max(a, x.peak), 0);
    return JSON.stringify({ theme: mx('theme'), seq: mx('seq') });
  })()`));
  console.log('\n  稳定 6 秒内的峰值 ' + JSON.stringify(avg));
  console.log('   → 配乐 ' + avg.theme + '　手鼓 ' + avg.seq);
  console.log('   → 比例 手鼓/配乐 = ' + (avg.theme > 0 ? (avg.seq / avg.theme).toFixed(1) : '∞') +
    '（大于 3 就是鼓明显压过配乐）');

  const fin = JSON.parse(await evalJs(`JSON.stringify({
    count: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.count : null,
    playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
    gain: window.__XM_THEME__ ? window.__XM_THEME__.state().gain : null,
    url: window.__XM_THEME__ ? window.__XM_THEME__.url : null,
    seqEnabled: window.__XM_SEQ__ ? window.__XM_SEQ__.enabled : null,
    seqVolume: window.__XM_SEQ__ ? window.__XM_SEQ__.volume : null,
    themeVolume: window.__XM_THEME__ ? window.__XM_THEME__.state().volume : null,
  })`));
  console.log('  最终 ' + JSON.stringify(fin));

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (real.length) real.slice(0, 3).forEach((e) => console.log('  异常 ' + e));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log('');
