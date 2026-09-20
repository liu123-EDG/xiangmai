/* 序章第一幕：把每一层的实际状态全打出来 —— 视频在不在放、透明度多少、
   谁盖住了谁。截图看不出来的东西这里全有。 */
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
const userDir = join(root, '.chrome-layer');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10181',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10181/json/list')).json();
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4400);

  const dump = () => evalJs(`(() => {
    const hv = document.getElementById('hero-video');
    const vids = [...document.querySelectorAll('#hero-video video')];
    const cs = hv ? getComputedStyle(hv) : null;
    const room = document.querySelector('.room');
    const layers = [...document.querySelectorAll('.room > *')].map((el) => {
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        sel: el.id ? '#' + el.id : (el.className.baseVal !== undefined
          ? '.' + el.className.baseVal.split(' ')[0] : '.' + String(el.className).split(' ')[0]),
        z: c.zIndex, op: +(+c.opacity).toFixed(2), vis: c.visibility,
        disp: c.display, box: [Math.round(r.top), Math.round(r.bottom)],
      };
    });
    return JSON.stringify({
      scrollY: Math.round(scrollY),
      heroH: document.getElementById('hero').offsetHeight,
      heroVideo: hv ? {
        on: hv.classList.contains('on'),
        gone: hv.classList.contains('gone'),
        op: +(+cs.opacity).toFixed(3),
        vis: cs.visibility, disp: cs.display, z: cs.zIndex,
        bg: cs.backgroundColor,
        box: (() => { const r = hv.getBoundingClientRect();
          return [Math.round(r.top), Math.round(r.bottom), Math.round(r.width)]; })(),
      } : null,
      vids: vids.map((v) => ({
        src: v.getAttribute('src') ? v.getAttribute('src').split('/').pop() : null,
        paused: v.paused, t: +v.currentTime.toFixed(2), w: v.videoWidth,
        op: +(+getComputedStyle(v).opacity).toFixed(2),
        disp: getComputedStyle(v).display,
      })),
      roomLayers: layers,
      guideOp: (() => { const g = document.getElementById('guide');
        return g ? +(+getComputedStyle(g).opacity).toFixed(2) : null; })(),
      guideText: (() => { const g = document.getElementById('guide-line');
        return g ? g.textContent.trim().slice(0, 18) : null; })(),
      wordsOp: (() => { const w = document.querySelector('.stage-words');
        return w ? +(+getComputedStyle(w).opacity).toFixed(2) : null; })(),
      videoGone: document.body.classList.contains('video-gone'),
      drumOp: (() => { const d = document.querySelector('.drum');
        return d ? +(+getComputedStyle(d).opacity).toFixed(2) : null; })(),
    });
  })()`).then(JSON.parse);

  for (const [label, act] of [['初始 (y=0)', null], ['第一幕 苍劲', 0], ['第二幕 叙事', 1], ['第三幕 欢腾', 2]]) {
    if (act !== null) {
      await evalJs(`document.querySelectorAll('.word')[${act}].click()`);
      await sleep(3000);
    }
    const d = await dump();
    console.log('\n── ' + label + ' ──   scrollY=' + d.scrollY + '  hero高=' + d.heroH);
    console.log('   #hero-video  ' + JSON.stringify(d.heroVideo));
    d.vids.forEach((v) => console.log('   video  ' + JSON.stringify(v)));
    console.log('   鼓 opacity ' + d.drumOp);
    console.log('   房间里的层（从下到上按 z）：');
    d.roomLayers.forEach((l) => console.log('     z=' + String(l.z).padStart(4) + '  op=' +
      String(l.op).padStart(5) + '  ' + String(l.disp).padEnd(6) + ' ' + l.sel.padEnd(16) +
      '  y ' + JSON.stringify(l.box)));
  }

  if (errs.length) errs.slice(0, 3).forEach((e) => console.log('\n   异常 ' + e));
  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
