/* 音频三问 · 真实出声诊断
   --------------------------------------------------------------------------
   关键：**测真实声音**，不是测状态标志。
   "enabled: true" 不等于有声音 —— 直连 destination 的节点不受
   AudioContext 是否 running 影响，所以状态说 running、实际可能一点声没有。

   做法：页面加载前注入探针，劫持 AudioContext，把所有输出接到一个
   AnalyserNode 上，每 200ms 记一次 RMS。这样"到底有没有声"是量出来的。
   -------------------------------------------------------------------------- */
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
const userDir = join(root, '.chrome-lvl');
await mkdir(userDir, { recursive: true });
const dbgPort = 10021;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 探针：劫持 AudioContext，把所有输出经一个 GainNode 旁路到分析器。
   **不能用 Proxy 替换 destination** —— 那样 connect() 会认不出它是 AudioNode，
   直接抛 "Overload resolution failed"，把页面音频整个弄坏（踩过）。
   正确做法：拿一个真实的 GainNode 当"假 destination"，
   它本来就是 AudioNode，一切照常。 */
const PROBE = `
(() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  window.__NODES__ = [];
  const RealAC = AC;

  function Patched(...args) {
    const ctx = new RealAC(...args);
    const realDest = ctx.destination;

    /* 每个 gain 节点都挂一个分析器，并记下它是谁建的。
       来源靠调用栈认：
         · theme.js 里的 playBuffer  → 主题曲
         · sequencer.js 里的 init    → 手鼓
       分析器只"旁听"（analyser 不消耗信号，可以并联很多个），
       不改动原本的连线，所以不会把音频弄坏。 */
    const realCreateGain = ctx.createGain.bind(ctx);
    ctx.createGain = function () {
      const g = realCreateGain();
      let tag = 'other';
      try {
        const st = (new Error()).stack || '';
        if (/playBuffer/.test(st)) tag = 'theme';
        else if (/sequencer|_tick|drum|voice/i.test(st)) tag = 'seq';
      } catch (e) {}
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      const buf = new Float32Array(an.fftSize);
      let peak = 0;
      const node = { tag, peak: 0, last: 0 };
      window.__NODES__.push(node);
      try { g.connect(an); } catch (e) {}
      const rec = () => {
        try {
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          const rms = Math.sqrt(s / buf.length);
          node.last = +rms.toFixed(5);
          if (rms > node.peak) node.peak = +rms.toFixed(5);
        } catch (e) {}
        setTimeout(rec, 150);
      };
      rec();
      return g;
    };

    return ctx;
  }
  Patched.prototype = RealAC.prototype;
  window.AudioContext = Patched;
  window.webkitAudioContext = Patched;
})();
`;

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
  /* 等一段时间，然后报各通路的峰值电平。
     分通路才能回答"到底是鼓在响还是配乐在响"。 */
  const peak = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) await sleep(250);
    return JSON.parse(await evalJs(`(() => {
      const n = window.__NODES__ || [];
      const mx = (t) => n.filter((x) => x.tag === t).reduce((a, x) => Math.max(a, x.peak), 0);
      return JSON.stringify({ theme: mx('theme'), seq: mx('seq'), other: mx('other'), nodes: n.length });
    })()`));
  };
  const gesture = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 39,
      code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 39,
      code: 'ArrowRight', key: 'ArrowRight' });
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(1500);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);

  console.log('\n[真实出声诊断]  分通路量 RMS 电平（0 = 该路没声）\n');

  /* ---- ① 第三章：手势后**配乐**该有声，且不该有鼓 ---- */
  console.log('  ── 第三章 · 达斯坦 ──');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dastan/index.html?t=${Date.now()}` });
  await sleep(3000);
  console.log('     载入后(无手势)  ' + JSON.stringify(await peak(1200)));
  await gesture();
  await sleep(2500);
  const c3a = await peak(3200);
  console.log('     手势后           ' + JSON.stringify(c3a));
  console.log('       → 配乐 ' + (c3a.theme > 0.001 ? '有声 ✓' : '没声 ✗') +
    '　手鼓 ' + (c3a.seq > 0.001 ? '有声 ✗（这一页不该有）' : '没声 ✓'));

  /* ---- ② 第五章：不要鼓点，只要背景音乐 ---- */
  console.log('\n  ── 第五章 · 历史与传承 ──');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/lishi/index.html?t=${Date.now()}` });
  await sleep(3000);
  const l0 = JSON.parse(await evalJs(`JSON.stringify({
    hasSeq: !!window.__XM_SEQ__,
    hasTheme: !!window.__XM_THEME__,
  })`));
  console.log('     载入时 ' + JSON.stringify(l0));
  if (l0.hasSeq) console.log('     ✗ 第五章建了手鼓音序器 —— 用户说不该有鼓点');
  else console.log('     ✓ 第五章没有手鼓音序器');
  await gesture();
  await sleep(2500);
  const l1 = await peak(3200);
  console.log('     手势后           ' + JSON.stringify(l1));
  console.log('       → 配乐 ' + (l1.theme > 0.001 ? '有声 ✓' : '没声 ✗') +
    '　手鼓 ' + (l1.seq > 0.001 ? '有声 ✗（不该有）' : '没声 ✓'));

  /* ---- ③ 第四章：点满 16 下之后该起配乐 ---- */
  console.log('\n  ── 第四章 · 麦西热甫（点满 16 下）──');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html?t=${Date.now()}` });
  await sleep(3200);
  await gesture();
  await sleep(1500);
  const beforeFull = JSON.parse(await evalJs(`JSON.stringify({
    hasTheme: !!window.__XM_THEME__,
    playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
    circle: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.count : null,
    max: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.max : null,
  })`));
  console.log('     点之前 ' + JSON.stringify(beforeFull));

  // 点满圆圈
  const max = beforeFull.max || 16;
  await evalJs(`(() => { for (let i = 0; i < ${max}; i++) window.__XM_CIRCLE__.add(); })()`);
  await sleep(3000);
  const afterFull = JSON.parse(await evalJs(`JSON.stringify({
    circle: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.count : null,
    playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
    ctx: window.__XM_THEME__ ? window.__XM_THEME__.state().ctxState : null,
    gain: window.__XM_THEME__ ? window.__XM_THEME__.state().gain : null,
  })`));
  const m4 = await peak(4200);
  console.log('     点满后 ' + JSON.stringify(afterFull));
  console.log('     点满后           ' + JSON.stringify(m4));
  console.log('       → 配乐 ' + (m4.theme > 0.001 ? '有声 ✓' : '没声 ✗') +
    '　手鼓 ' + (m4.seq > 0.001 ? '有声（这一页该有）' : '没声 ✗'));

  ws.close();
} catch (e) { console.error('\n错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log('');
