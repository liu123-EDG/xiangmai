/* 验带声的 webm：真的有一条音轨吗？放出来有没有声音？
   光看文件变大不能说明问题 —— 空的音轨也会占字节。
   所以在浏览器里放一遍，用 AnalyserNode 量 RMS。 */
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
const userDir = join(root, '.chrome-vaudio');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10431',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader', '--window-size=1200,700', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10431/json/list')).json();
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
  const evalJs = async (expr, t = 90000) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, timeout: t });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(800);

  console.log('\n════════ 带声 webm 音轨核实 ════════\n');

  for (const f of ['full-circle-slim.webm', 'full-circle-slim-m.webm']) {
    const raw = await evalJs(`(async () => {
      const rel = 'assets/video/full/' + ${JSON.stringify(f)};
      const v = document.createElement('video');
      v.src = rel; v.playsInline = true;
      await new Promise((r) => { v.onloadeddata = r; v.onerror = () => r(); });
      if (!v.videoWidth) return JSON.stringify({ err: '解码失败 code=' + (v.error ? v.error.code : '?') });

      /* captureStream 能拿到几条轨，就是音轨有没有进去的直接证据 */
      let tracks = { audio: 0, video: 0 };
      try {
        const cs = v.captureStream ? v.captureStream() : (v.mozCaptureStream ? v.mozCaptureStream() : null);
        if (cs) {
          tracks.audio = cs.getAudioTracks().length;
          tracks.video = cs.getVideoTracks().length;
        }
      } catch (e) { tracks.err = String(e && e.message); }

      /* 再用 AnalyserNode 量实际电平：接一条空音轨也会有 track，
         但 RMS 会一直是 0。两个判据合起来才说明"真的有声音"。 */
      let rms = 0, peak = 0, rmsErr = null;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC();
        const src = ac.createMediaElementSource(v);
        const an = ac.createAnalyser();
        an.fftSize = 2048;
        src.connect(an);
        await v.play();
        const buf = new Float32Array(an.fftSize);
        let sum = 0, n = 0, pk = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 4000) {
          an.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; if (Math.abs(buf[i]) > pk) pk = Math.abs(buf[i]); }
          n += buf.length;
          await new Promise((r) => setTimeout(r, 60));
        }
        rms = Math.sqrt(sum / Math.max(1, n));
        peak = pk;
        v.pause();
      } catch (e) { rmsErr = String(e && e.name) + ': ' + String(e && e.message).slice(0, 60); }

      return JSON.stringify({
        w: v.videoWidth, h: v.videoHeight, tracks, rmsErr,
        rms: +rms.toFixed(5), peak: +peak.toFixed(4),
      });
    })()`, 120000);
    const r = JSON.parse(raw);
    console.log('  ' + f);
    if (r.err) { console.log('    ✗ ' + r.err + '\n'); continue; }
    console.log('    画面 ' + r.w + '×' + r.h);
    console.log('    音轨 ' + r.tracks.audio + ' 条，视频轨 ' + r.tracks.video + ' 条');
    console.log('    实测 RMS ' + r.rms + '   峰值 ' + r.peak +
      (r.rmsErr ? '   （量电平出错：' + r.rmsErr + '）' : ''));
    if (r.tracks.audio > 0 && r.rms > 0.0005) console.log('    ✓ 真的有声音');
    else if (r.tracks.audio === 0) console.log('    ✗ 文件里没有音轨');
    else console.log('    ✗ 有音轨但电平是 0（空音轨）');
    console.log('');
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
