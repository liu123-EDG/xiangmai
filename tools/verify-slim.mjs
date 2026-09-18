/* 验证瘦身后的 mp4：能不能被解码、画面是不是真的、有没有坏帧。
   手写封装很容易"文件生成了但播放器不认"，所以必须验。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4', '.png': 'image/png', '.css': 'text/css; charset=utf-8' };

/* 把 .tmp 里的成品放到能被服务器访问的位置 */
await mkdir(join(root, '.tmp/serve'), { recursive: true });
const names = ['01-mural', '02-drain', '03-black'];
const origDir = join(root, 'assets/video/reveal');
for (const n of names) {
  const slim = join(root, '.tmp', n + '-slim.mp4');
  if (existsSync(slim)) await copyFile(slim, join(root, '.tmp/serve', n + '-slim.mp4'));
}

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
const userDir = join(root, '.chrome-verify-v');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9881',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--enable-unsafe-swiftshader', '--window-size=1200,700', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('    ok   ' + m);
const bad = (m) => { fails++; console.log('    FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9881/json/list')).json();
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
  const evalJs = async (expr, timeoutMs = 120000) => {
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
  await sleep(700);

  console.log('\n════════ 瘦身版可播性验证 ════════\n');

  for (const n of names) {
    const slim = '.tmp/serve/' + n + '-slim.mp4';
    if (!existsSync(join(root, slim))) { console.log('  ' + n + '：没有瘦身版，跳过'); continue; }
    console.log('  ' + n);

    const r = JSON.parse(await evalJs(`(async () => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true;
      v.src = ${JSON.stringify('/' + slim)} + '?t=' + Date.now();
      const out = { events: [] };
      await new Promise((res) => {
        const fin = () => res();
        v.onloadedmetadata = () => { out.events.push('loadedmetadata'); };
        v.onloadeddata = () => { out.events.push('loadeddata'); fin(); };
        v.onerror = () => { out.events.push('error'); out.err = v.error ? v.error.code : '?'; fin(); };
        setTimeout(fin, 8000);
      });
      if (out.err) return JSON.stringify(out);
      out.w = v.videoWidth; out.h = v.videoHeight;
      out.dur = +v.duration.toFixed(3);
      out.ready = v.readyState;

      /* 抽三帧看画面是不是真的（不是全黑） */
      const cv = document.createElement('canvas');
      cv.width = 160; cv.height = 90;
      const g = cv.getContext('2d');
      out.frames = [];
      for (const t of [0.3, 2.5, 4.7]) {
        await new Promise((res) => {
          const done = () => { v.removeEventListener('seeked', done); res(); };
          v.addEventListener('seeked', done);
          v.currentTime = t;
        });
        g.drawImage(v, 0, 0, 160, 90);
        const d = g.getImageData(0, 0, 160, 90).data;
        let lum = 0, nonBlack = 0;
        for (let i = 0; i < d.length; i += 4) {
          const L = (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]) / 255;
          lum += L;
          if (L > 0.04) nonBlack++;
        }
        const px = d.length / 4;
        out.frames.push({ t, lum: +(lum / px).toFixed(4), lit: +(nonBlack / px).toFixed(3) });
      }
      return JSON.stringify(out);
    })()`));

    if (r.err) { bad(n + ' 解码失败，error code = ' + r.err); continue; }
    ok('能解码：' + r.w + '×' + r.h + '  ' + r.dur + ' 秒  readyState=' + r.ready);
    if (r.w === 960 && r.h === 540) ok('尺寸正确 960×540');
    else bad('尺寸是 ' + r.w + '×' + r.h);
    if (Math.abs(r.dur - 5.09) < 0.15) ok('时长正确 ' + r.dur + ' 秒');
    else bad('时长不对：' + r.dur);
    for (const f of r.frames) {
      if (f.lum > 0.004) ok(f.t + 's 有画面（平均亮度 ' + f.lum + '，' + (f.lit * 100).toFixed(0) + '% 非黑）');
      else bad(f.t + 's 是全黑 —— 那一帧没编进去');
    }
  }

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 瘦身版可播\n'));
process.exit(fails ? 1 : 0);
