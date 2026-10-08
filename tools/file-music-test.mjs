/* file:// 下音乐到底响不响 —— 这条测试是给"双击打开"这个场景用的。
   背景：fetch/XHR 在 file:// 下被 CORS 挡掉，Web Audio 那条路整个不通，
   所以做了一条 <audio> 元素的后备实现。
   这个脚本证明它真的出声，而不是"我觉得应该响了"。 */
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
const userDir = join(root, '.chrome-filemusic');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10331',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
  '--enable-unsafe-swiftshader', '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10331/json/list')).json();
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
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });

  console.log('\n[file:// 下的音乐]\n');

  /* 三页都验：第五章（主题曲）、第三章（两段配乐）、入口页（环境配乐）。
     都在 file:// 下打开。 */
  const pages = [
    ['lishi/index.html', '第五章'],
    ['dastan/index.html', '第三章'],
    ['welcome/index.html', '入口页'],
  ];

  for (const [page, label] of pages) {
    await send('Page.navigate', { url: 'file:///' + join(root, page).replace(/\\/g, '/') });
    await sleep(3600);

    const kind = await evalJs(`(() => {
      const t = (window.__XM_THEME__ || window.__XM_AMB__);
      if (!t || !t.state) return 'none';
      return t.state().ctxState;
    })()`);

    if (kind !== 'element') {
      bad(label + '：走的是 ' + kind + '，不是 file:// 后备实现 —— 后备没生效');
      continue;
    }
    ok(label + '：用的是 <audio> 后备实现（ctxState=element）');

    // 第一次交互之后应当真的在放
    await evalJs(`window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
    await sleep(2200);

    const st = JSON.parse(await evalJs(`(() => {
      const t = (window.__XM_THEME__ || window.__XM_AMB__);
      const s = t.state();
      return JSON.stringify({
        playing: s.playing, ready: s.ready, gain: s.gain, volume: s.volume,
        duration: s.duration, url: s.url, readyState: s.readyState,
        networkState: s.networkState, actualSrc: s.actualSrc, errCode: s.errCode,
      });
    })()`));
    console.log('       ' + JSON.stringify(st));

    if (st.playing) ok(label + '：手势之后在播');
    else bad(label + '：没在播');
    if (st.ready && st.duration > 5) ok(label + '：音频已解码，时长 ' + st.duration + 's');
    else bad(label + '：音频没加载（时长 ' + st.duration + '）');
    if (st.gain > 0.05) ok(label + '：音量拉到 ' + st.gain + '（淡入生效）');
    else bad(label + '：音量还是 ' + st.gain + '（淡入没走）');

    // 时间真的在走才算出声
    const t1 = await evalJs(`(() => {
      const t = (window.__XM_THEME__ || window.__XM_AMB__);
      return t && t.state ? t.state().currentTime : -1;
    })()`);
    await sleep(1500);
    const t2 = await evalJs(`(() => {
      const t = (window.__XM_THEME__ || window.__XM_AMB__);
      return t && t.state ? t.state().currentTime : -1;
    })()`);
    if (t1 >= 0 && t2 > t1) ok(label + '：播放头在走 ' + t1 + ' → ' + t2);
    else bad(label + '：播放头没动（' + t1 + ' → ' + t2 + '）');
  }

  /* 对照：http 下必须还是原来那条 Web Audio 路，不能被后备实现顶掉。 */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/lishi/index.html` });
  await sleep(3200);
  const httpKind = await evalJs(`(() => {
    const t = (window.__XM_THEME__ || window.__XM_AMB__);
    return t && t.state ? t.state().ctxState : 'none';
  })()`);
  if (httpKind === 'element') bad('http 下也走了元素后备 —— 那 Web Audio 的好处就白丢了');
  else ok('http 下仍走 Web Audio（ctxState=' + httpKind + '）');

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ file:// 下音乐自检通过\n'));
process.exit(fails ? 1 : 0);
