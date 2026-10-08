/* 八族分页自检
   这一条是给"八个页面"用的。判据分三层：
     ① 页面能开、脚本跑完、没有 404
     ② **内容真的渲染出来了** —— 标题/正文字数/字段数/来源
        （上次"12 个空方块"能过自检，就是因为我只验了结构没验内容）
     ③ 每族的色相真的落到了页面上 —— 这是"八个风格"的判据
   还有一条特别的：未收录的两族**必须显示"尚未收录"**，
   不能伪装成已收录。 */
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
const userDir = join(root, '.chrome-ethnic');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10361',
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
      const list = await (await fetch('http://127.0.0.1:10361/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  let req404 = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Network.responseReceived') {
      const r = m.params.response;
      if (r.status >= 400) req404.push(r.status + ' ' + r.url.split('/').slice(-2).join('/'));
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

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[八族分页自检]\n');
  console.log('  族        名称        收录  标题   正文段  字段  同族  色相  说明');

  const seenHues = new Set();

  for (const item of HERITAGE) {
    req404 = [];
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/heritage/${item.id}/index.html` });
    await sleep(2600);

    const r = JSON.parse(await evalJs(`(() => {
      const h = window.__XM_HERITAGE__;
      const q = (s) => document.querySelector(s);
      const accent = getComputedStyle(document.body).getPropertyValue('--eh-accent').trim();
      const titleEl = q('.h-title');
      // 标题上算出来的颜色，用来证明"族色真的落到页面上了"
      const kickerColor = q('.h-kicker') ? getComputedStyle(q('.h-kicker')).color : null;
      return JSON.stringify({
        has: !!h,
        st: h ? h.state() : null,
        title: titleEl ? titleEl.textContent.trim() : '',
        paras: document.querySelectorAll('.h-p').length,
        fields: document.querySelectorAll('.h-field').length,
        related: document.querySelectorAll('.h-related li').length,
        src: q('.h-src') ? q('.h-src').textContent.trim().slice(0, 20) : '',
        notice: !!q('.h-notice'),
        badge: q('.h-badge') ? q('.h-badge').textContent.trim().slice(0, 8) : '',
        back: !!q('.h-back a'),
        accent,
        kickerColor,
        bodyLen: (q('.ethnic') ? q('.ethnic').innerText : '').replace(/\\s/g, '').length,
        bootErr: (window.__XM_BOOT_ERR__ || []).length,
        render: document.body.dataset.render,
      });
    })()`));

    if (!r.has) { bad(item.group + '：渲染器没挂上'); continue; }

    const collected = item.collected;
    const wantParas = (item.body || []).length;
    const wantFields = ['level', 'region', 'form', 'instrument']
      .filter((k) => item[k]).length;

    const problems = [];
    if (!r.title) problems.push('标题是空的');
    else if (r.title !== item.name) problems.push('标题不对：' + r.title);
    /* **内容判据**：正文段数要够、字段要够、来源要在 */
    if (r.paras !== wantParas) problems.push('正文 ' + r.paras + ' 段，应为 ' + wantParas);
    if (r.fields !== wantFields) problems.push('字段 ' + r.fields + ' 个，应为 ' + wantFields);
    if (!r.src) problems.push('没有来源行');
    if (!r.back) problems.push('没有返回旋律图的链接');
    if (r.bodyLen < 120) problems.push('页面文字太少（' + r.bodyLen + ' 字），像空页');
    if (r.bootErr) problems.push('启动错误 ' + r.bootErr + ' 条');
    /* **诚实判据**：未收录的必须显示说明，已收录的不该显示 */
    if (!collected && !r.notice) problems.push('未收录却没显示「尚未收录」说明');
    if (collected && r.notice) problems.push('已收录却挂着未收录说明');

    const flag = problems.length ? '✗' : 'ok';
    console.log('  ' + item.group.padEnd(8) + item.name.padEnd(12) +
      (collected ? '收录 ' : '未收 ') + flag.padEnd(4) + ' ' +
      String(r.paras).padStart(3) + String(r.fields).padStart(6) +
      String(r.related).padStart(6) + String(item.hue).padStart(6) + '  ' +
      (badge(r)) + (problems.length ? '  ★ ' + problems.join('；') : ''));
    if (problems.length) fails++;

    seenHues.add(item.hue);

    if (req404.length) bad(item.group + '：有请求失败 ' + req404.slice(0, 2).join('，'));
  }

  console.log('');
  /* 「八个风格」的硬判据：八个色相互不相同 */
  if (seenHues.size === 8) ok('八族色相互不相同（' + [...seenHues].join(' / ') + '）');
  else bad('色相只有 ' + seenHues.size + ' 种，八个风格没落全');

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

function badge(r) {
  return r.notice ? '未收录说明在' : (r.badge || '（无标签）');
}

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 八族分页自检通过\n'));
process.exit(fails ? 1 : 0);
