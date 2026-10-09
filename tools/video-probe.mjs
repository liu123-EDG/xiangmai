/* 直接把那个 webm 加载进浏览器，看它到底能不能解。
   把每个事件按顺序打出来 —— 比"错误码 4"有用得多。 */
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
const userDir = join(root, '.chrome-vprobe');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10401',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1200,700', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10401/json/list')).json();
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
  const evalJs = async (expr, t = 60000) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, timeout: t });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');

  /* 两种协议都测：
       http://   —— 线上（GitHub Pages）
       file://   —— 本地双击打开（作者最常用的方式）
     file:// 下视频能否加载，是个独立问题：它不走 fetch，
     但受"本地文件"策略影响，值得单独看一眼。 */
  const proto = process.argv.includes('--file') ? 'file' : 'http';
  if (proto === 'file') {
    await send('Page.navigate', { url: 'file:///' + join(root, 'index.html').replace(/\\/g, '/') });
  } else {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  }
  await sleep(900);
  console.log('\n协议：' + (proto === 'file' ? 'file://（本地双击）' : 'http://（线上）'));

  for (const f of ['full-circle-slim.webm', 'full-circle-slim-m.webm']) {
    const raw = await evalJs(`(async () => {
      const rel = ${JSON.stringify(proto)} === 'file'
        ? 'file:///${join(root, 'assets/video/full').replace(/\\/g, '/')}/' + ${JSON.stringify(f)}
        : 'assets/video/full/' + ${JSON.stringify(f)};
      const log = [];
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true;
      const evs = ['loadstart','durationchange','loadedmetadata','loadeddata','canplay',
                   'canplaythrough','progress','suspend','stalled','abort','error','ended','emptied'];
      evs.forEach((e) => v.addEventListener(e, () => {
        log.push(e + (e === 'error' ? ' code=' + (v.error ? v.error.code : '?') : '') +
          ' rs=' + v.readyState + ' ns=' + v.networkState +
          ' t=' + v.currentTime.toFixed(2) +
          ' dur=' + (isFinite(v.duration) ? v.duration.toFixed(2) : String(v.duration)));
      }));
      v.src = rel;
      v.load();
      await new Promise((r) => setTimeout(r, 3000));

      /* 试着播一下，看能不能起来 */
      let playErr = null;
      try { await v.play(); } catch (e) { playErr = (e && e.name) + ': ' + (e && e.message); }
      await new Promise((r) => setTimeout(r, 2500));

      return JSON.stringify({
        file: rel, log,
        playErr,
        vw: v.videoWidth, vh: v.videoHeight,
        dur: isFinite(v.duration) ? +v.duration.toFixed(2) : String(v.duration),
        t: +v.currentTime.toFixed(2),
        paused: v.paused,
        errCode: v.error ? v.error.code : null,
        errMsg: v.error ? v.error.message : null,
        seekable: v.seekable.length ? [v.seekable.start(0), v.seekable.end(0)] : null,
      });
    })()`, 90000);
    const r = JSON.parse(raw);
    console.log('\n════ ' + r.file + ' ════');
    console.log('  尺寸 ' + r.vw + '×' + r.vh + '   时长 ' + r.dur + '   播放头 ' + r.t +
      '   paused=' + r.paused);
    console.log('  seekable ' + JSON.stringify(r.seekable));
    console.log('  播放错误 ' + (r.playErr || '（无）'));
    console.log('  元素错误 ' + (r.errCode === null ? '（无）' : 'code ' + r.errCode + '  ' + r.errMsg));
    console.log('  事件序列：');
    r.log.forEach((l) => console.log('    ' + l));
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
