/* 八音总页面自检
   判据：
     ① 八张卡都在、每张的链接指向对应那一族
     ② 卡上的色相 = 那一族档案页的色相（两边必须同源，不能各写各的）
     ③ 卡片有**内容**（族名、名称、说明都不是空的）——
        上一次做空方块就是只验了结构
     ④ 从总页面点进某一族，落到的是那一页
     ⑤ 导航里有入口，而且和附录同一道门 */
import { createServer } from 'node:http';
import { readFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { HERITAGE } from '../js/lib/heritage-data.js';

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
const userDir = join(root, '.chrome-hub');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10421',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10421/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const bad_req = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      bad_req.push(m.params.response.status + ' ' + m.params.response.url.split('/').slice(-2).join('/'));
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[八音总页面]\n');

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/heritage/index.html` });
  await sleep(1200);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/heritage/index.html` });
  await sleep(2800);

  const r = JSON.parse(await evalJs(`(() => {
    const cards = [...document.querySelectorAll('.hub-card')];
    return JSON.stringify({
      n: cards.length,
      stats: document.querySelectorAll('#hub-stats li').length,
      cards: cards.map((c) => ({
        href: c.getAttribute('href'),
        hue: c.style.getPropertyValue('--eh').trim(),
        group: (c.querySelector('.hub-card__group') || {}).textContent || '',
        name: (c.querySelector('.hub-card__name') || {}).textContent || '',
        note: (c.querySelector('.hub-card__note') || {}).textContent || '',
        src: (c.querySelector('.hub-card__src') || {}).textContent || '',
        // 卡片左边那道族色条真的上色了吗
        barColor: (() => {
          const b = c.querySelector('.hub-card__bar');
          return b ? getComputedStyle(b).backgroundColor : null;
        })(),
      })),
      bootErr: (window.__XM_BOOT_ERR__ || []).length,
    });
  })()`));

  if (r.n === 8) ok('八张卡都在');
  else bad('卡片数 = ' + r.n);
  if (r.stats === 4) ok('开头统计 4 项');
  else bad('统计项 = ' + r.stats);
  if (!r.bootErr) ok('脚本没报错');
  else bad('启动错误 ' + r.bootErr + ' 条');

  /* 每张卡：链接对、色相对、内容非空 */
  const problems = [];
  HERITAGE.forEach((h) => {
    const c = r.cards.find((x) => x.href && x.href.indexOf(h.id) >= 0);
    if (!c) { problems.push(h.group + ' 没有卡'); return; }
    if (c.group.trim() !== h.group) problems.push(h.group + ' 族名不对：' + c.group);
    if (c.name.trim() !== h.name) problems.push(h.group + ' 名称不对：' + c.name);
    if (c.hue !== String(h.hue)) problems.push(h.group + ' 色相 ' + c.hue + '，应为 ' + h.hue);
    if (c.note.trim().length < 8) problems.push(h.group + ' 说明太短：' + c.note);
    if (!c.barColor || c.barColor === 'rgba(0, 0, 0, 0)') problems.push(h.group + ' 色条没上色');
  });
  if (!problems.length) ok('八张卡：族名 / 名称 / 色相 / 说明 / 色条 全部正确');
  else problems.forEach(bad);

  /* 色相必须和档案页同源 —— 不能总页面一套、档案页另一套 */
  const mismatched = HERITAGE.filter((h) => {
    const c = r.cards.find((x) => x.href && x.href.indexOf(h.id) >= 0);
    return !c || c.hue !== String(h.hue);
  });
  if (!mismatched.length) ok('卡上色相与档案页同源（都取自 heritage-data.js 的 hue）');
  else bad('色相不同源：' + mismatched.map((h) => h.group).join('、'));

  /* ---- 点第一张卡，落到那一族 ---- */
  const first = r.cards[0];
  await evalJs(`document.querySelector('.hub-card').click()`);
  await sleep(2200);
  const url = await evalJs('location.pathname');
  if (url.indexOf('/heritage/') >= 0 && url !== '/heritage/index.html') {
    ok('点第一张卡 → ' + url + '（' + first.group.trim() + '）');
  } else bad('点卡片没进档案页，当前在 ' + url);

  /* ---- 导航里有入口，而且锁着 ---- */
  const nav = JSON.parse(await evalJs(`(() => {
    const links = [...document.querySelectorAll('.sitelinks a, .navburger a, .sitelinks__item, nav a')];
    const hit = links.find((a) => (a.getAttribute('href') || '').indexOf('heritage/index.html') >= 0);
    return JSON.stringify({
      found: !!hit,
      href: hit ? hit.getAttribute('href') : null,
      label: hit ? hit.textContent.trim().replace(/\\s+/g, ' ') : null,
      locked: hit ? (hit.classList.contains('is-locked') || !!hit.querySelector('.sitelinks__lock')) : null,
    });
  })()`));
  if (nav.found) ok('导航里有「八族档案」入口：' + nav.label);
  else bad('导航里找不到入口');

  if (!bad_req.length) ok('没有请求失败');
  else bad('有请求失败：' + bad_req.slice(0, 3).join('，'));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 八音总页面自检通过\n'));
process.exit(fails ? 1 : 0);
