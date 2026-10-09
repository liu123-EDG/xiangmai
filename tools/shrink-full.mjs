/* ==========================================================================
   给第四章那个「满圈之后播一遍」的视频瘦身
   --------------------------------------------------------------------------
   原始 1280×720 / 15.1 秒 / 22.4 MB —— 直接上站太重。
   走 tools/shrink-video.mjs 同一条路：交给浏览器 MediaRecorder 编码 + 封装，
   出来的 webm 一定是对的容器（手写 mp4 盒子那次浏览器报错码 4）。

   三个差别：
     1) 源文件是作者给的，不在 assets 里 —— 先 cp 进来
     2) **只当画面用**：MediaRecorder 这里只录 canvas 流，**不带音轨**，
        现场有主题曲，视频再加一条音轨只会打架。所以静音是设计，不是缺陷
     3) 两档：桌面 960×540 / 2.2 Mbps，手机 640×360 / 1.1 Mbps

   用法：node tools/shrink-full.mjs            只出桌面版
         node tools/shrink-full.mjs --both     两档都出
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat, copyFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));

/* 源文件放哪。
   **不进仓库** —— 22.4 MB 是站里最大的单个文件，而站点只用压好的 webm。
   .tmp/ 已经在 .gitignore 里。
   要找它：先看 .tmp/source/，再看作者给的附件目录。 */
const SRC_CANDIDATES = [
  join(root, '.tmp', 'source', 'full-circle.mp4'),
  process.argv.find((a) => a.endsWith('.mp4') && !a.startsWith('-')) || '',
  'C:/Users/HP/.dsh/attachments/v1/files/3e/3e2af768d885b8734fcfa2646eb1afc913de81947aacfdfde2be4b7803a6cd11/视频.mp4',
].filter(Boolean);
const REL_DIR = 'assets/video/full';
const NAME = 'full-circle';

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
const userDir = join(root, '.chrome-full');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10381',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1200,700', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 先把源文件找出来，拷进 .tmp/source/（临时目录，不进仓库） */
const SRC = SRC_CANDIDATES.find((p) => existsSync(p));
if (!SRC) {
  console.error('\n找不到源文件。把原始 mp4 放到 .tmp/source/full-circle.mp4，');
  console.error('或者用 node tools/shrink-full.mjs <你的.mp4> 指定路径。\n');
  process.exit(1);
}
await mkdir(join(root, '.tmp', 'source'), { recursive: true });
const srcLocal = join(root, '.tmp', 'source', 'full-circle.mp4');
if (!existsSync(srcLocal) || statSync(srcLocal).size !== statSync(SRC).size) {
  await copyFile(SRC, srcLocal);
  console.log('  源文件 → .tmp/source/full-circle.mp4（临时目录，不进仓库）');
}

/* 提供给页面用的目录 */
await mkdir(join(root, REL_DIR), { recursive: true });

const BOTH = process.argv.includes('--both');
/* --silent：出一版没有音轨的。默认**带声音** ——
   作者拍的片子本身有现场声，静音播放是把内容丢掉一半。
   和主题曲的冲突由 fullfilm.js 那边处理（播放期间把主题曲压下去）。 */
const SILENT = process.argv.includes('--silent');
const TARGETS = BOTH
  ? [{ width: 960, height: 540, bps: 2_200_000, suffix: '-slim' },
     { width: 640, height: 360, bps: 1_100_000, suffix: '-slim-m' }]
  : [{ width: 960, height: 540, bps: 2_200_000, suffix: '-slim' }];

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10381/json/list')).json();
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

  const before = statSync(srcLocal).size;
  console.log('\n════════ 满圈视频瘦身 ════════');
  console.log('  源 ' + (before / 1048576).toFixed(2) + ' MB（.tmp/source/full-circle.mp4）\n');

  for (const T of TARGETS) {
    process.stdout.write('  ' + (T.width + '×' + T.height).padEnd(10) + ' 录制中…（约 15 秒）');

    const raw = await evalJs(`(async () => {
      const src = '.tmp/source/full-circle.mp4';
      const W = ${T.width}, H = ${T.height}, BPS = ${T.bps};
      if (!window.MediaRecorder) return JSON.stringify({ err: '没有 MediaRecorder' });

      const buf = await (await fetch('/' + src + '?t=' + Date.now())).arrayBuffer();
      const v = document.createElement('video');
      v.src = URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
      v.playsInline = true;

      /* 先生成音轨，再起播。
         **顺序很要紧**：createMediaElementSource 必须在 play() 之前接好，
         否则头几百毫秒的声音录不进去。
         另外这里不能设 v.muted —— 静音元素的 MediaElementSource
         输出也是静的，录出来是一条空音轨。 */
      const SILENT = ${SILENT ? 'true' : 'false'};
      let ac = null;
      if (!SILENT) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        v.volume = 1;
      } else {
        v.muted = true;
      }

      await new Promise((r) => { v.onloadeddata = r; v.onerror = () => r(); });
      if (!v.videoWidth) {
        return JSON.stringify({ err: '解码失败：videoWidth=0，元素错误码 ' +
          (v.error ? v.error.code + ' ' + v.error.message : '无') });
      }

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');

      const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9',
                     'video/webm;codecs=vp8,opus', 'video/webm'];
      const mime = cands.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) return JSON.stringify({ err: '不支持 webm 录制' });

      /* 画面：canvas 流。声音：另接一条 MediaStreamDestination，
         把它的音轨加进同一个流里 —— canvas.captureStream() 只有画面，
         要录声音必须自己拼这条轨。
         音轨压到 64 kbps：这是"现场感"的声音，不需要高保真，
         体积省下来都给画面。 */
      const stream = cv.captureStream(30);
      if (!SILENT && ac) {
        const srcNode = ac.createMediaElementSource(v);
        const dest = ac.createMediaStreamDestination();
        srcNode.connect(dest);
        const at = dest.stream.getAudioTracks()[0];
        if (at) stream.addTrack(at);
        // 只接 dest 不接扬声器：录得到，但不会在有头浏览器里外放
      }

      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: BPS,
        ...(SILENT ? {} : { audioBitsPerSecond: 64000 }),
      });
      const parts = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(200);

      v.currentTime = 0;
      await v.play().catch(() => {});
      const t0 = performance.now();
      await new Promise((res) => {
        function draw() {
          if (v.ended || performance.now() - t0 > (v.duration + 1) * 1000) return res();
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
      const ab = await blob.arrayBuffer();
      let bin = '';
      const u8 = new Uint8Array(ab);
      const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      }
      return JSON.stringify({
        b64: btoa(bin), bytes: u8.length, mime,
        w: W, h: H, inW: v.videoWidth, inH: v.videoHeight, dur: +v.duration.toFixed(2),
      });
    })()`);

    const r = JSON.parse(raw);
    if (r.err) { console.log('\r  ' + T.width + '×' + T.height + '  失败：' + r.err); continue; }

    const out = join(root, REL_DIR, NAME + T.suffix + '.webm');
    await writeFile(out, Buffer.from(r.b64, 'base64'));
    const after = statSync(out).size;

    console.log('\r  ' + (T.width + '×' + T.height).padEnd(10) +
      (before / 1048576).toFixed(2) + ' MB → ' + (after / 1048576).toFixed(2) + ' MB  ' +
      '（省 ' + (100 - after / before * 100).toFixed(0) + '%）  ' +
      r.dur + 's  ' + r.mime.replace('video/webm;codecs=', '') + '  ' +
      '→ assets/video/full/' + NAME + T.suffix + '.webm');
  }

  ws.close();
} catch (e) { console.error('\n错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
console.log('');
