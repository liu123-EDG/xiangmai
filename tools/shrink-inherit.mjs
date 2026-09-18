/* ==========================================================================
   传承之路 8 段 · 视频瘦身
   --------------------------------------------------------------------------
   原始 8 段共 55 MB（平均 6.9 MB），直接上网站会卡死。
   用和概念片同一套办法压：浏览器 MediaRecorder 出 webm/vp9。
     · 桌面 960×540 / 2.2 Mbps
     · 手机 640×360 / 1.1 Mbps

   **保留声音** —— 这八段是有声的（原素材就带音轨），
   和概念片那种纯画面不一样，所以这里要把音轨一起录进去。

   用法：node tools/shrink-inherit.mjs [--mobile]
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

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

const MOBILE = process.argv.includes('--mobile');
const T = MOBILE
  ? { w: 640, h: 360, bps: 1_100_000, suffix: '-m' }
  : { w: 960, h: 540, bps: 2_200_000, suffix: '' };

const userDir = join(root, '.chrome-shrink-i');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9951',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  /* 这一段要录音轨，所以不能 --mute-audio */
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader', '--window-size=1200,700', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9951/json/list')).json();
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
  const evalJs = async (expr, timeoutMs = 240000) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, timeout: timeoutMs });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(800);

  const dir = join(root, 'assets/video/inherit');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.mp4') && !/-slim/.test(f));

  console.log('\n════════ 传承之路 · 视频瘦身 ════════');
  console.log('  目标 ' + T.w + '×' + T.h + '  ' + (T.bps / 1e6).toFixed(1) + ' Mbps  webm/vp9' +
    '   （保留音轨）' + (MOBILE ? '   手机版' : '') + '\n');

  let beforeTotal = 0, afterTotal = 0;

  for (const name of files) {
    const rel = 'assets/video/inherit/' + name;
    const before = statSync(join(root, rel)).size;
    beforeTotal += before;
    process.stdout.write('  ' + name.padEnd(16) + '录制中…');

    const raw = await evalJs(`(async () => {
      const src = ${JSON.stringify(rel)};
      const W = ${T.w}, H = ${T.h}, BPS = ${T.bps};
      if (!window.MediaRecorder) return JSON.stringify({ err: '没有 MediaRecorder' });

      const buf = await (await fetch('/' + src + '?t=' + Date.now())).arrayBuffer();
      const v = document.createElement('video');
      v.src = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
      v.playsInline = true;
      /* 这一版**不静音** —— 原素材有声，要一起录下来。
         但录制的音源走 captureStream，不会真的外放。 */
      v.volume = 1;
      await new Promise((r) => { v.onloadeddata = r; v.onerror = () => r(); });
      if (!v.videoWidth) return JSON.stringify({ err: '解码失败' });
      const inW = v.videoWidth, inH = v.videoHeight, dur = v.duration;

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');

      const mimes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) return JSON.stringify({ err: '不支持 webm 录制' });

      /* 画面走 canvas，声音走元素自身的音轨 —— 两边合到一个 stream 里。 */
      const vstream = cv.captureStream(30);
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const src2 = ac.createMediaElementSource(v);
        const dest = ac.createMediaStreamDestination();
        src2.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => vstream.addTrack(t));
      } catch (e) { /* 拿不到音轨就只录画面，不让整段失败 */ }

      const rec = new MediaRecorder(vstream, { mimeType: mime, videoBitsPerSecond: BPS });
      const parts = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(200);

      v.currentTime = 0;
      await v.play().catch(() => {});
      const t0 = performance.now();
      await new Promise((res) => {
        function draw() {
          if (v.ended || performance.now() - t0 > (dur + 1) * 1000) return res();
          g.drawImage(v, 0, 0, W, H);
          requestAnimationFrame(draw);
        }
        draw();
      });
      await new Promise((r) => setTimeout(r, 250));
      rec.stop();
      await stopped;
      v.pause();

      const blob = new Blob(parts, { type: mime });
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      const tracks = vstream.getAudioTracks().length;
      return JSON.stringify({
        b64: btoa(bin), bytes: u8.length, mime, audioTracks: tracks,
        w: W, h: H, inW, inH, dur: +dur.toFixed(2),
      });
    })()`, 300000);

    const r = JSON.parse(raw);
    if (r.err) { console.log(' 失败：' + r.err); continue; }

    const out = join(root, '.tmp', name.replace(/\.mp4$/, '') + '-slim' + T.suffix + '.webm');
    writeFileSync(out, Buffer.from(r.b64, 'base64'));
    const after = statSync(out).size;
    afterTotal += after;

    console.log('\r  ' + name.padEnd(16) +
      (before / 1048576).toFixed(2) + ' → ' + (after / 1048576).toFixed(2) + ' MB  ' +
      '（省 ' + (100 - after / before * 100).toFixed(0) + '%）  ' +
      r.inW + '×' + r.inH + ' → ' + r.w + '×' + r.h +
      '  音轨 ' + r.audioTracks + (r.audioTracks ? ' ✓' : ' ✗'));
  }

  console.log('\n  合计 ' + (beforeTotal / 1048576).toFixed(1) + ' MB → ' +
    (afterTotal / 1048576).toFixed(1) + ' MB   （省 ' +
    (100 - afterTotal / beforeTotal * 100).toFixed(0) + '%）');
  console.log('  输出在 .tmp/*-slim' + T.suffix + '.webm\n');

  ws.close();
} catch (e) { console.error('\n错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
