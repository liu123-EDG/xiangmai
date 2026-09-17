/* 第三章场景配乐自检：第一段起播、切场景换成第二段、之后不再换回。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const body = await readFile(join(root, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-scene');
await mkdir(userDir, { recursive: true });
const dbgPort = 9711;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errs = []; const mp3s = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
    if (m.method === 'Network.responseReceived' && /\.mp3/.test(m.params.response.url)) {
      mp3s.push(m.params.response.status + ' ' + m.params.response.url.split('/').pop());
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[第三章 · 场景配乐自检]');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dastan/index.html` });
  await sleep(4500);
  await sleep(1200);   // 等两段都解码

  const before = await evalJs(`JSON.stringify({
    ready: window.__XM_THEME__ ? window.__XM_THEME__.ready : null,
    playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
    url: window.__XM_THEME__ ? window.__XM_THEME__.url : null,
    scene: window.__XM_SCENE__ ? window.__XM_SCENE__() : null,
  })`);
  console.log('       手势前 ' + before);

  // 第一次手势：真点一下
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 500, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 500, button: 'left', clickCount: 1 });
  await sleep(2600);

  const s0 = JSON.parse(await evalJs(`JSON.stringify({
    playing: window.__XM_THEME__.playing,
    url: window.__XM_THEME__.url,
    st: window.__XM_THEME__.state(),
    scene: window.__XM_SCENE__(),
    cache: window.__XM_THEME__.state().cached,
  })`));
  console.log('       场景 0 ' + JSON.stringify(s0));
  if (s0.playing) ok('手势后配乐起播');
  else bad('手势后没播');
  if (s0.url && s0.url.indexOf('scene-a') >= 0) ok('第一场景用的是 scene-a');
  else bad('第一场景的音轨不对：' + s0.url);
  if (s0.st.gain > 0 && s0.st.gain <= 0.35) ok('音量已调轻（gain=' + s0.st.gain + '/0.30）');
  else bad('音量不是轻档：' + s0.st.gain);
  if (s0.cache >= 2) ok('两段都已解码缓存（cached=' + s0.cache + '）');
  else bad('第二段没预载：cached=' + s0.cache);

  // 滚到 1/3 以后：应当切到 scene-b
  const anchorH = await evalJs(`document.getElementById('px-anchor').offsetHeight`);
  await evalJs(`window.scrollTo(0, ${Math.round((anchorH + 900) * 0.5)})`);
  await sleep(1800);
  const s1 = JSON.parse(await evalJs(`JSON.stringify({
    scene: window.__XM_SCENE__(), url: window.__XM_THEME__.url,
    playing: window.__XM_THEME__.playing, gain: window.__XM_THEME__.state().gain,
  })`));
  console.log('       场景 1 ' + JSON.stringify(s1));
  if (s1.scene === 1) ok('滚动后到第二场景');
  else bad('场景没换：' + s1.scene);
  if (s1.url && s1.url.indexOf('scene-b') >= 0) ok('已交叉淡入到 scene-b');
  else bad('没换到 scene-b：' + s1.url);
  if (s1.playing) ok('换曲后仍在播（没有断）');
  else bad('换曲时断了');

  // 滚到 2/3 以后：仍应停在 scene-b，不换回
  await evalJs(`window.scrollTo(0, ${Math.round((anchorH + 900) * 0.9)})`);
  await sleep(1800);
  const s2 = JSON.parse(await evalJs(`JSON.stringify({
    scene: window.__XM_SCENE__(), url: window.__XM_THEME__.url, playing: window.__XM_THEME__.playing,
  })`));
  console.log('       场景 2 ' + JSON.stringify(s2));
  if (s2.scene === 2) ok('滚动后到第三场景');
  else bad('场景没到第三个：' + s2.scene);
  if (s2.url && s2.url.indexOf('scene-b') >= 0) ok('第三场景沿用 scene-b（按设计不换回）');
  else bad('第三个场景换了音轨：' + s2.url);

  // 往回滚：不应当换回 scene-a（保持"之后不再换回"）
  await evalJs(`window.scrollTo(0, ${Math.round((anchorH + 900) * 0.5)})`);
  await sleep(1600);
  const s3 = await evalJs(`window.__XM_THEME__.url`);
  if (s3.indexOf('scene-b') >= 0) ok('往回滚也不换回 scene-a');
  else bad('往回滚换回了：' + s3);

  console.log('       mp3 请求 ' + (mp3s.length ? [...new Set(mp3s)].join(' / ') : '（无）'));
  if (mp3s.some((m) => m.indexOf('200') === 0)) ok('音频请求 200');
  else bad('音频没请求成功');

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 场景配乐自检通过') + '\n');
process.exit(fails ? 1 : 0);
