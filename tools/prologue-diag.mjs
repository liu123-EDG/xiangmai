/* 序章布局诊断
   查三件事：
     ① "上面那一大块黑屏"到底是什么 —— 量首屏里各层的实际占位
     ② 滚动时鼓的段号跟文字是不是同步（用户说"滑到叙事才启动"）
     ③ 三个词现在能不能点 */
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
const userDir = join(root, '.chrome-seq');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10111',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10111/json/list')).json();
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
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  /* ① 页面各段的高度：找出用户说的"一大块黑屏" */
  const layout = JSON.parse(await evalJs(`(() => {
    const h = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.height), top: Math.round(r.top + scrollY) };
    };
    return JSON.stringify({
      docH: document.documentElement.scrollHeight,
      hero: h('#hero'),
      room: h('.room'),
      guide: h('#guide'),
      pillarWrap: h('.pillar-wrap'),
      drumHost: h('.drum-host'),
      stageWords: h('.stage-words'),
      figure: h('.figure'),
      foot: h('.foot'),
      actnav: h('.actnav'),
      network: h('#network'),
      tail: h('#tail'),
      networkHidden: getComputedStyle(document.getElementById('network')).display,
    });
  })()`));
  console.log('\n[① 页面分段高度]  总高 ' + layout.docH + 'px（视口 900）\n');
  for (const k of ['hero', 'room', 'guide', 'pillarWrap', 'drumHost', 'stageWords',
                   'figure', 'foot', 'actnav', 'network', 'tail']) {
    const v = layout[k];
    console.log('  ' + k.padEnd(12) + (v ? ('top ' + String(v.top).padStart(6) + '   高 ' + String(v.h).padStart(6)) : '（没有）'));
  }
  console.log('  network display = ' + layout.networkHidden);

  /* ② 滚动时鼓与文字是否同步 */
  console.log('\n[② 滚动分幕：文字 vs 鼓]\n');
  console.log('  progress    stage   显示的词    鼓段号');
  const heroH = layout.hero ? layout.hero.h : 0;
  for (const p of [0, 0.08, 0.12, 0.35, 0.45, 0.80, 0.90]) {
    await evalJs(`(() => {
      const hero = document.getElementById('hero');
      const d = Math.max(1, hero.offsetHeight - innerHeight);
      scrollTo(0, hero.offsetTop + d * ${p});
    })()`);
    await sleep(1400);
    const st = JSON.parse(await evalJs(`(() => {
      const shown = [...document.querySelectorAll('.word')]
        .filter((w) => w.classList.contains('is-shown'))
        .map((w) => w.textContent.trim());
      const d = window.__XM_DRUM__;
      return JSON.stringify({
        stage: document.body.dataset.stage,
        shown: shown.join(',') || '（无）',
        drum: d ? d.state().section : null,
      });
    })()`));
    console.log('  ' + String(p).padStart(6) + '     ' + String(st.stage).padStart(3) +
      '     ' + st.shown.padEnd(10) + '  ' + st.drum);
  }

  /* ③ 三个词现在能不能点 */
  const clickable = JSON.parse(await evalJs(`(() => {
    const ws = [...document.querySelectorAll('.word')];
    return JSON.stringify(ws.map((w) => {
      const cs = getComputedStyle(w);
      return {
        t: w.textContent.trim(),
        tag: w.tagName,
        cursor: cs.cursor,
        pointerEvents: cs.pointerEvents,
        role: w.getAttribute('role'),
        tabindex: w.getAttribute('tabindex'),
      };
    }));
  })()`));
  console.log('\n[③ 三个词的可点击状态]');
  clickable.forEach((c) => console.log('  ' + JSON.stringify(c)));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
