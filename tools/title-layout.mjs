/* 量入口页标题里每个元素的实际位置 —— 看谁压在谁身上。 */
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
const userDir = join(root, '.chrome-layout');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10041',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10041/json/list')).json();
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(3600);
  await evalJs(`(() => { const f = window.__XM_FILM__; if (f) f.seek(14.5);
    if (window.__XM_PAINT__) window.__XM_PAINT__(14.5); })()`);
  await sleep(700);

  const rep = JSON.parse(await evalJs(`(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        h: Math.round(r.height), mid: Math.round(r.top + r.height / 2),
        mt: cs.marginTop, fs: cs.fontSize, pos: cs.position, z: cs.zIndex,
      };
    };
    return JSON.stringify({
      viewMid: Math.round(innerHeight / 2),
      vh: innerHeight,
      title: box('.w-title'),
      row: box('.w-title__row'),
      ug: box('.w-title__ug'),
      bloom: box('.w-title__bloom'),
      cn: box('.w-title__cn'),
      rule: box('.w-title__rule'),
      lat: box('.w-title__lat'),
      video: (() => { const v = document.querySelector('#hero-video video.on');
        if (!v) return null; const r = v.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom),
                 h: Math.round(r.height), mid: Math.round(r.top + r.height / 2) }; })(),
    });
  })()`));

  console.log('\n[标题各层的实际位置]  视口高 ' + rep.vh + '，中线 y=' + rep.viewMid + '\n');
  console.log('  元素             top   bottom  高   中点    margin-top   字号      定位');
  for (const k of ['title', 'row', 'ug', 'bloom', 'cn', 'rule', 'lat', 'video']) {
    const b = rep[k];
    if (!b) { console.log('  ' + k.padEnd(16) + '（没有）'); continue; }
    console.log('  ' + k.padEnd(16) +
      String(b.top).padStart(5) + String(b.bottom).padStart(8) +
      String(b.h).padStart(6) + String(b.mid).padStart(7) + '   ' +
      String(b.mt || '—').padStart(11) + '  ' + String(b.fs || '—').padStart(9) +
      '  ' + (b.pos || ''));
  }
  console.log('');
  if (rep.video) {
    const d = rep.video.mid - rep.viewMid;
    console.log('  视频中线和视口中线差 ' + d + 'px' +
      (Math.abs(d) > 4 ? '  ← 视频不是垂直居中的！金线不在视口中线上' : '  （一致）'));
  }
  const cnLine = rep.cn ? rep.cn.top : 0;
  console.log('  汉字顶部 y=' + cnLine + '　' +
    (cnLine > rep.viewMid + 8 ? '在中线下方 ' + (cnLine - rep.viewMid) + 'px' : '★ 在中线上或以上，必被金线压'));
  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
