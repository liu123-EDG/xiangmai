/* file:// 下音频到底能不能拿到？
   对比三种途径：fetch / XHR / <audio> 元素。
   结论决定怎么修 —— 不能凭猜。 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const userDir = join(root, '.chrome-fileaudio');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10311',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10311/json/list')).json();
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
  const evalJs = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      return { __err: (d.exception && (d.exception.description || d.exception.value)) || d.text };
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });

  const fileUrl = 'file:///' + join(root, 'lishi/index.html').replace(/\\/g, '/');
  await send('Page.navigate', { url: fileUrl });
  await sleep(3000);

  console.log('\n[file:// 下取音频的三条路]\n');

  const mp3 = '../assets/audio/mashrap/theme.mp3';

  // ① fetch
  const r1 = await evalJs(`(async () => {
    try {
      const r = await fetch(${JSON.stringify(mp3)});
      const b = await r.arrayBuffer();
      return JSON.stringify({ ok: r.ok, status: r.status, bytes: b.byteLength });
    } catch (e) { return JSON.stringify({ err: String(e && e.message).slice(0, 70) }); }
  })()`);
  console.log('  ① fetch        ' + JSON.stringify(r1));

  // ② XMLHttpRequest（老办法，有时不受 fetch 的 CORS 限制）
  const r2 = await evalJs(`new Promise((res) => {
    try {
      const x = new XMLHttpRequest();
      x.open('GET', ${JSON.stringify(mp3)}, true);
      x.responseType = 'arraybuffer';
      x.onload = () => res(JSON.stringify({ status: x.status, bytes: x.response ? x.response.byteLength : 0 }));
      x.onerror = () => res(JSON.stringify({ err: 'onerror' }));
      x.send();
    } catch (e) { res(JSON.stringify({ err: String(e && e.message).slice(0, 70) })); }
  })`);
  console.log('  ② XHR          ' + JSON.stringify(r2));

  // ③ <audio> 元素（媒体元素走的是另一套加载路径）
  const r3 = await evalJs(`new Promise((res) => {
    const a = new Audio();
    a.preload = 'auto';
    a.muted = true;
    const done = (o) => res(JSON.stringify(o));
    a.addEventListener('loadedmetadata', () => done({
      ok: true, duration: +a.duration.toFixed(2), w: a.videoWidth || null,
      src: a.currentSrc ? a.currentSrc.split('/').pop() : null }));
    a.addEventListener('error', () => done({ err: 'error', code: a.error ? a.error.code : null }));
    setTimeout(() => done({ err: 'timeout' }), 6000);
    a.src = ${JSON.stringify(mp3)};
  })`);
  console.log('  ③ <audio>      ' + JSON.stringify(r3));

  // ④ 用 audio 元素 + MediaElementSource 能不能接进 Web Audio
  const r4 = await evalJs(`(async () => {
    try {
      const a = new Audio(${JSON.stringify(mp3)});
      a.muted = true; a.preload = 'auto';
      await new Promise((res, rej) => {
        a.addEventListener('loadedmetadata', res, { once: true });
        a.addEventListener('error', () => rej(new Error('audio error')), { once: true });
        setTimeout(() => rej(new Error('timeout')), 6000);
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaElementSource(a);
      const an = ctx.createAnalyser();
      src.connect(an); an.connect(ctx.destination);
      await ctx.resume();
      await a.play();
      await new Promise((r) => setTimeout(r, 1200));
      const buf = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return JSON.stringify({ ok: true, rms: +Math.sqrt(s / buf.length).toFixed(5),
        duration: +a.duration.toFixed(2) });
    } catch (e) { return JSON.stringify({ err: String(e && e.message).slice(0, 80) }); }
  })()`);
  console.log('  ④ audio→WebAudio ' + JSON.stringify(r4));

  console.log('\n  → 哪条路通，就用哪条兜底\n');
  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
