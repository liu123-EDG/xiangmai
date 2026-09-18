/* ==========================================================================
   视频瘦身（第二版：交给浏览器封装）
   --------------------------------------------------------------------------
   第一版我手写了 mp4 的 moov/mdat/avcC，结果浏览器直接报错码 4（不认容器）。
   那种活儿细节太多，不值得——改用浏览器自带的 MediaRecorder：
   它负责编码**和**封装，出来的 webm 直接能播。

   代价：录制是实时的（5 秒素材要录 5 秒），三段一共约 16 秒。
   这个代价完全可以接受，换取"一定是对的容器"。

   用法：node tools/shrink-video.mjs
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4', '.png': 'image/png', '.css': 'text/css; charset=utf-8' };

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

const userDir = join(root, '.chrome-shrink');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9871',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1200,700', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 目标：960×540, 2.2 Mbps。
   背景片不需要 720p 高码率；在 1600px 宽的全屏下依然清楚。 */
const TARGET = { width: 960, height: 540, bps: 2_200_000 };

const files = ['01-mural.mp4', '02-drain.mp4', '03-black.mp4'];

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9871/json/list')).json();
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
  const evalJs = async (expr, timeoutMs = 180000) => {
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

  console.log('\n════════ 视频瘦身（浏览器封装）════════');
  console.log('  目标 ' + TARGET.width + '×' + TARGET.height + '  ' +
    (TARGET.bps / 1e6).toFixed(1) + ' Mbps  webm/vp9\n');

  for (const name of files) {
    const rel = 'assets/video/reveal/' + name;
    if (!existsSync(join(root, rel))) { console.log('  跳过（不存在）：' + name); continue; }
    const before = statSync(join(root, rel)).size;
    process.stdout.write('  ' + name.padEnd(16) + ' 录制中…');

    const raw = await evalJs(`(async () => {
      const src = ${JSON.stringify(rel)};
      const W = ${TARGET.width}, H = ${TARGET.height}, BPS = ${TARGET.bps};
      if (!window.MediaRecorder) return JSON.stringify({ err: '没有 MediaRecorder' });

      const buf = await (await fetch('/' + src + '?t=' + Date.now())).arrayBuffer();
      const v = document.createElement('video');
      v.src = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
      v.muted = true; v.playsInline = true;
      await new Promise((r) => { v.onloadeddata = r; v.onerror = () => r(); });
      if (!v.videoWidth) return JSON.stringify({ err: '解码失败' });
      const inW = v.videoWidth, inH = v.videoHeight, dur = v.duration;

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');

      /* 挑一个支持的 mime。vp9 质量/体积最好，退而求其次 vp8。 */
      const cands = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mime = cands.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) return JSON.stringify({ err: '不支持 webm 录制' });

      const stream = cv.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BPS });
      const parts = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(200);

      /* 实时播放一遍，边播边画 —— MediaRecorder 是实时录制，
         所以这里必须真等（5 秒素材就录 5 秒）。 */
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
      await new Promise((r) => setTimeout(r, 250));   // 让最后一帧也进容器
      rec.stop();
      await stopped;
      v.pause();

      const blob = new Blob(parts, { type: mime });
      const ab = await blob.arrayBuffer();
      let bin = '';
      const u8 = new Uint8Array(ab);
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      }
      return JSON.stringify({
        b64: btoa(bin), bytes: u8.length, mime,
        w: W, h: H, inW, inH, dur: +dur.toFixed(2),
      });
    })()`, 240000);

    const r = JSON.parse(raw);
    if (r.err) { console.log(' 失败：' + r.err); continue; }

    const out = join(root, '.tmp', name.replace(/\.mp4$/, '') + '-slim.webm');
    writeFileSync(out, Buffer.from(r.b64, 'base64'));
    const after = statSync(out).size;

    console.log('\r  ' + name.padEnd(16) +
      (before / 1048576).toFixed(2) + ' MB → ' + (after / 1048576).toFixed(2) + ' MB  ' +
      '（省 ' + (100 - after / before * 100).toFixed(0) + '%）  ' +
      r.inW + '×' + r.inH + ' → ' + r.w + '×' + r.h + '  ' + r.mime.replace('video/webm;codecs=', ''));
  }

  ws.close();
} catch (e) { console.error('\n错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('');
