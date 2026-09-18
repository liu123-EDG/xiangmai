/* 入口页时间轴对账：直接拨时钟到各个关键点，看画面状态对不对。
   比"等真实时间"可靠 —— 无头浏览器会节流定时器。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-wtl');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9861',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9861/json/list')).json();
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
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/welcome/index.html` });
  await sleep(4200);

  console.log('\n[入口页时间轴对账]  直接拨时钟');
  console.log('   时刻    段   文字op  blur    规则     中文   英文   入口亮');
  const probe = async (sec) => {
    await evalJs(`(() => { window.__XM_FILM__.seek(${sec}); window.__XM_PAINT__(${sec}); })()`);
    await sleep(320);
    return JSON.parse(await evalJs(`(() => {
      const q = (s) => document.querySelector(s);
      const ug = q('.w-title__ug'), ru = q('.w-title__rule');
      const cn = q('.w-title__cn'), la = q('.w-title__lat');
      const cl = window.__XM_FILM__.state().curClip;
      const f = getComputedStyle(ug).filter;
      return JSON.stringify({
        clip: cl,
        op: +(+getComputedStyle(ug).opacity).toFixed(2),
        blur: +(f.match(/blur\\(([\\d.]+)px\\)/) || [0, 99])[1],
        rule: parseFloat(ru.style.width) || 0,
        cn: +(+cn.style.opacity || 0).toFixed(2),
        lat: +(+la.style.opacity || 0).toFixed(2),
        lit: q('#w-go').classList.contains('is-lit'),
      });
    })()`));
  };

  const cases = [
    { s: 2.0,   clip: 0, text: 0,    why: '第一段壁画，无文字' },
    { s: 7.0,   clip: 1, text: 0,    why: '第二段抽色，无文字' },
    { s: 11.0,  clip: 2, text: 0.3,  why: '第三段，维吾尔文正在浮现' },
    { s: 13.0,  clip: 2, text: 0.95, why: '维吾尔文清晰 + 中文出现' },
    { s: 15.0,  clip: 2, text: 0.95, why: '定格段，文字仍在' },
    { s: 16.8,  clip: 2, text: 0.95, why: '片尾，入口应亮起' },
    { s: 0.5,   clip: 0, text: 0,    why: '绕回开头，文字应清干净' },
  ];

  for (const c of cases) {
    const r = await probe(c.s);
    console.log('   ' + String(c.s).padStart(4) + 's   ' + r.clip + '   ' +
      String(r.op).padStart(5) + '  ' + String(r.blur).padStart(5) + '  ' +
      String(r.rule).padStart(5) + '  ' + String(r.cn).padStart(5) + '  ' +
      String(r.lat).padStart(5) + '   ' + (r.lit ? '亮' : '暗') + '   ' + c.why);
    if (r.clip !== c.clip) bad(c.s + 's 的段号应是 ' + c.clip + '，实际 ' + r.clip);
  }

  console.log('');
  const a = await probe(2.0), b = await probe(7.0), c = await probe(11.0);
  const d = await probe(13.0), e = await probe(15.0), f2 = await probe(16.8), g = await probe(0.5);

  if (a.clip === 0 && a.op === 0) ok('第一段：壁画、无文字'); else bad('第一段状态不对');
  if (b.clip === 1 && b.op === 0) ok('第二段：抽色、无文字'); else bad('第二段状态不对');
  if (c.op > 0.5 && c.op < 0.98 && c.blur > 0.5) ok('第三段：维吾尔文已基本浮现（op=' + c.op + ' blur=' + c.blur.toFixed(2) + '）');
  else bad('第三段文字状态不对：op=' + c.op + ' blur=' + c.blur);
  if (d.op > 0.9 && d.blur < 1) ok('维吾尔文已清晰');
  else bad('维吾尔文没清晰：op=' + d.op + ' blur=' + d.blur);
  /* 中文在 12.6s 起、1.4 秒淡完 → 13s 时约一半，14s 才满。
     所以 13 秒这一档只要求"已经在出现"，不要求满。 */
  if (d.cn > 0.3) ok('中文已开始出现（' + d.cn + '）'); else bad('中文没出现：' + d.cn);
  if (d.rule > 10) ok('分隔线已展开（' + d.rule.toFixed(1) + 'vmin）');
  else bad('分隔线没展开：' + d.rule);
  if (e.op > 0.9) ok('定格段文字仍清晰（片子最长的一段）');
  else bad('定格段文字没了：' + e.op);
  if (f2.lit) ok('片尾入口亮起（提示该进去了）'); else bad('片尾入口没亮');
  if (!a.lit) ok('开头入口是暗的（不抢画面）'); else bad('开头入口就亮着，会抢画面');
  if (g.op === 0) ok('绕回开头后文字已清干净'); else bad('绕回开头文字还留着：' + g.op);

  // 拍两张：文字最清楚时 + 片尾
  await evalJs(`(() => { window.__XM_FILM__.seek(14.5); window.__XM_PAINT__(14.5); })()`);
  await sleep(700);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome-title.png'), Buffer.from(shot.result.data, 'base64'));
  await evalJs(`(() => { window.__XM_FILM__.seek(17.0); window.__XM_PAINT__(17.0); })()`);
  await sleep(700);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'welcome-end.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('\n   截图 shots/welcome-title.png 与 welcome-end.png');

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 时间轴对账通过') + '\n');
process.exit(fails ? 1 : 0);
