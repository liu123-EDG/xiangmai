/* 传承之路：环境片有没有放起来
   用户报"这一页背景也有视频吧，视频呢" —— 因为环境片从来没被播过。
   这条测试就是盯着这个：进场时背景必须有视频在放，而且是循环的。 */
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
const userDir = join(root, '.chrome-intro');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10161',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10161/json/list')).json();
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
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
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

  const vids = () => evalJs(`JSON.stringify(
    [...document.querySelectorAll('.g-video')].map((v) => ({
      src: v.getAttribute('src') ? v.getAttribute('src').split('/').pop() : null,
      on: v.classList.contains('is-on'),
      paused: v.paused,
      loop: v.loop,
      t: +v.currentTime.toFixed(2),
      w: v.videoWidth,
      err: v.error ? v.error.code : null,
    }))
  )`).then(JSON.parse);

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[环境片自检]\n');

  for (const [lvl, want] of [['muqam', 'gobi'], ['gesar', 'steppe']]) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/game/index.html?level=${lvl}` });
    await sleep(4200);
    const list = await vids();
    console.log('  ' + lvl + '  ' + JSON.stringify(list));

    const on = list.filter((v) => v.on && !v.paused);
    if (!on.length) { bad(lvl + '：进场时没有任何视频在放 —— 背景就是一块纯色'); continue; }
    const intro = on[0];
    if (new RegExp(want).test(intro.src || '')) ok(lvl + '：环境片在放 → ' + intro.src);
    else bad(lvl + '：放的不是环境片，是 ' + intro.src);
    if (intro.loop) ok('环境片是循环的（loop=true）');
    else bad('环境片没设 loop，放一遍就停');
    if (intro.w > 0) ok('已解出画面 ' + intro.w + 'px');
    else bad('没有画面尺寸，没解出来');
    if (!intro.err) ok('无解码错误'); else bad('解码错误 ' + intro.err);

    /* 环境片该一直在走 */
    const t1 = intro.t;
    await sleep(2500);
    const after = (await vids()).filter((v) => v.on && !v.paused);
    if (after.length && after[0].t !== t1) ok('时间在走（' + t1 + ' → ' + after[0].t + '）');
    else bad('环境片停住了');

    /* 选一个选项之后：剧情片该盖上来，环境片该让开 */
    await evalJs(`document.querySelectorAll('.g-choice')[1].click()`);
    await sleep(1800);
    const plot = await vids();
    console.log('     选对之后 ' + JSON.stringify(plot));
    const playing = plot.filter((v) => v.on && !v.paused);
    if (playing.some((v) => /live/.test(v.src || ''))) ok('剧情片（活着那段）接上了');
    else bad('剧情片没接上：' + JSON.stringify(plot));
    if (playing.some((v) => new RegExp(want).test(v.src || ''))) {
      bad('环境片还在放 —— 会和剧情片叠在一起');
    } else ok('环境片已让开');
  }

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (real.length) real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 环境片自检通过\n'));
process.exit(fails ? 1 : 0);
