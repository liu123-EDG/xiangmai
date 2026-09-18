/* 主题曲 + 解锁门自检：
   未解锁时入口是否被拦下、完成互动后是否解锁、音频是否真的在播。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

/* 导航格数从 site.js 现算，不写死 ——
   写死的话每加一个页面就报"顶栏格数 = 7"这种假失败，白查一轮（踩过）。 */
const NAV_COUNT = (() => {
  const src = readFileSync(new URL('../js/lib/site.js', import.meta.url), 'utf8');
  const i = src.indexOf('export const NAV');
  const block = src.slice(i, src.indexOf('];', i));
  return (block.match(/id:\s*'/g) || []).length;
})();

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
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9681;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
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
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 140));
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

  console.log('\n[主题曲 + 解锁门自检]');

  /* ---------- 0. 导航上那一格应当锁着，并把人送去互动 ---------- */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(3800);
  await evalJs('localStorage.removeItem("xiangmai.unlocked.mashrap")');
  await send('Page.reload', { ignoreCache: true });
  await sleep(3800);

  const navLock = JSON.parse(await evalJs(`(() => {
    const a = [...document.querySelectorAll('.sitelinks a')].find(x => x.textContent.indexOf('形制比较') >= 0);
    return JSON.stringify({
      found: !!a,
      locked: a ? a.classList.contains('is-locked') : null,
      hasIcon: a ? !!a.querySelector('.sitelinks__lock') : null,
      lockHref: a ? a.getAttribute('data-lock-href') : null,
      navCount: document.querySelectorAll('.sitelinks a').length,
    });
  })()`));
  console.log('       首页导航 ' + JSON.stringify(navLock));
  /* 格数从 site.js 的 NAV 现算，不写死 ——
     加一个页面就报"顶栏格数 = 7"这种假失败，白查一轮（踩过）。 */
  if (navLock.navCount === NAV_COUNT) ok('顶栏 ' + NAV_COUNT + ' 格（首页也走 mountShell 了）');
  else bad('顶栏格数 = ' + navLock.navCount + '，应为 ' + NAV_COUNT);
  if (navLock.locked && navLock.hasIcon) ok('「附录」那一格显示为锁着');
  else bad('导航没上锁：' + JSON.stringify(navLock));

  // 点它：应当不跳去附录，而是被送去第四章互动
  await evalJs(`[...document.querySelectorAll('.sitelinks a')].find(x => x.textContent.indexOf('形制比较') >= 0)
    .dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))`);
  await sleep(1400);
  const navJump = await evalJs('location.pathname + location.hash');
  console.log('       点导航后到 ' + navJump);
  if (navJump.indexOf('mashrap') >= 0) ok('点锁着的导航 → 被送去第四章互动（' + navJump + '）');
  else bad('点锁着的导航跑错地方：' + navJump);

  /* ---------- 1. 未解锁时，附录的入口应当被拦下 ---------- */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(4200);

  const locked = JSON.parse(await evalJs(`JSON.stringify({
    lockedNodes: document.querySelectorAll('.wnode.is-locked').length,
    lockedNotes: document.querySelectorAll('.mnote.is-locked').length,
    gateVisible: (() => { const g = document.getElementById('gate-note'); return g ? g.classList.contains('is-on') : null; })(),
    hasGate: !!document.getElementById('gate-note'),
  })`));
  console.log('       未解锁 ' + JSON.stringify(locked));
  if (locked.lockedNodes === 12) ok('轮盘 12 格已上锁'); else bad('上锁的轮盘节点 = ' + locked.lockedNodes);
  if (locked.lockedNotes === 8) ok('旋律 8 个音符已上锁'); else bad('上锁的音符 = ' + locked.lockedNotes);
  if (locked.hasGate) ok('提示条已就位'); else bad('页面里没有提示条');

  // 真点一下：应当被拦（停在原页），并弹出提示
  await evalJs(`document.querySelector('.wnode').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))`);
  await sleep(900);
  const blocked = JSON.parse(await evalJs(`JSON.stringify({
    path: location.pathname,
    gateOn: document.getElementById('gate-note').classList.contains('is-on'),
    gateText: document.getElementById('gate-note').textContent.trim().slice(0, 30),
    hasLink: !!document.querySelector('#gate-note a'),
  })`));
  console.log('       点击后 ' + JSON.stringify(blocked));
  if (blocked.path.indexOf('fulu') >= 0) ok('点击被拦下，没有跳走');
  else bad('点击竟然跳走了：' + blocked.path);
  if (blocked.gateOn && blocked.hasLink) ok('提示条弹出并给出前往第四章的链接');
  else bad('提示条没弹出：' + JSON.stringify(blocked));

  /* ---------- 2. 玩完互动后应当解锁 ---------- */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(4200);
  // 等主题曲解码完（fetch + decode）
  await sleep(1500);
  const themeReady = await evalJs(`typeof window.__XM_THEME__ !== 'undefined' && window.__XM_THEME__ ? window.__XM_THEME__.ready : null`);
  console.log('       主题曲就绪 = ' + themeReady);

  await evalJs(`(() => { for (let i = 0; i < 24; i++) window.__XM_CIRCLE__.add(); })()`);
  await sleep(1800);

  const afterFull = JSON.parse(await evalJs(`JSON.stringify({
    count: window.__XM_CIRCLE__.count,
    unlocked: localStorage.getItem('xiangmai.unlocked.mashrap'),
    playing: window.__XM_THEME__ ? window.__XM_THEME__.playing : null,
    ready: window.__XM_THEME__ ? window.__XM_THEME__.ready : null,
    duration: window.__XM_THEME__ ? Math.round(window.__XM_THEME__.duration) : 0,
  })`));
  console.log('       满圈后 ' + JSON.stringify(afterFull));
  if (afterFull.unlocked === '1') ok('解锁标记已写入'); else bad('解锁标记没写：' + afterFull.unlocked);
  if (afterFull.ready) ok('主题曲已解码（时长 ' + afterFull.duration + ' 秒）');
  else bad('主题曲没解码成功');
  if (afterFull.playing) ok('主题曲已在播放'); else bad('满圈了但主题曲没响');

  /* ---------- 3. 回到附录，门应当开了 ---------- */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(4200);
  const opened = JSON.parse(await evalJs(`JSON.stringify({
    lockedNodes: document.querySelectorAll('.wnode.is-locked').length,
    lockedNotes: document.querySelectorAll('.mnote.is-locked').length,
    gate: !!document.getElementById('gate-note'),
  })`));
  console.log('       解锁后 ' + JSON.stringify(opened));
  if (opened.lockedNodes === 0 && opened.lockedNotes === 0) ok('锁已全部解除');
  else bad('还有锁没解：' + JSON.stringify(opened));
  if (!opened.gate) ok('提示条已移除'); else bad('提示条还在');

  const realErrs = logs.filter((l) => !/favicon/i.test(l));
  if (!realErrs.length) ok('无运行时异常');
  else realErrs.slice(0, 4).forEach((l) => bad(l));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 主题曲与解锁门自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
