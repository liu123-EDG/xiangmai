/* 确认 <audio> → Web Audio 这条路在 file:// 下真的出声。
   上一次 rms=0 是因为我把元素设成 muted —— 静音元素接进 Web Audio 也是静音的。
   这次不静音，并且同时看 currentTime 有没有在走。 */
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const userDir = join(root, '.chrome-fileaudio2');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10321',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10321/json/list')).json();
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
  await send('Page.navigate', { url: 'file:///' + join(root, 'lishi/index.html').replace(/\\/g, '/') });
  await sleep(3000);

  console.log('\n[<audio> → Web Audio，file:// 下]\n');

  // 不静音。看 currentTime 走不走 + 分析器读到的电平。
  const r = await evalJs(`(async () => {
    const a = new Audio('../assets/audio/mashrap/theme.mp3');
    a.preload = 'auto';
    a.volume = 1;
    a.loop = true;
    await new Promise((res, rej) => {
      a.addEventListener('loadedmetadata', res, { once: true });
      a.addEventListener('error', () => rej(new Error('audio load error')), { once: true });
      setTimeout(() => rej(new Error('load timeout')), 6000);
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const src = ctx.createMediaElementSource(a);
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(gain); gain.connect(an); an.connect(ctx.destination);
    await ctx.resume();
    await a.play();
    const t0 = a.currentTime;
    await new Promise((r) => setTimeout(r, 1500));
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let s = 0, peak = 0;
    for (let i = 0; i < buf.length; i++) { s += buf[i] * buf[i]; peak = Math.max(peak, Math.abs(buf[i])); }
    return JSON.stringify({
      ok: true,
      duration: +a.duration.toFixed(2),
      muted: a.muted,
      paused: a.paused,
      timeAdvanced: +(a.currentTime - t0).toFixed(2),
      ctxState: ctx.state,
      rms: +Math.sqrt(s / buf.length).toFixed(5),
      peak: +peak.toFixed(4),
    });
  })()`);
  console.log('  结果 ' + JSON.stringify(r));

  // 走网络的那条对照（http 下 fetch 是通的，量一下同一段的 rms）
  await send('Page.navigate', { url: 'http://127.0.0.1:1/x' }).catch(() => {});
  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
