/* 参考来源页自检
   验：来源渲染出来了、外链指向对、未核实清单在、
   以及**外链真的能打开**（逐条访问，死链比不写更糟）。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
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
const userDir = join(root, '.chrome-src');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10101',
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
      const list = await (await fetch('http://127.0.0.1:10101/json/list')).json();
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
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(1200);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(3600);

  console.log('\n[参考来源自检]');

  const st = JSON.parse(await evalJs(`(() => {
    const host = document.getElementById('sources-host');
    const links = [...document.querySelectorAll('.src__t')];
    const rows = [...document.querySelectorAll('.src__table tbody tr')];
    return JSON.stringify({
      hasHost: !!host,
      inPage: !!document.getElementById('src-act'),
      title: document.querySelector('#src-act .act__title')
        ? document.querySelector('#src-act .act__title').textContent.trim() : null,
      groups: [...document.querySelectorAll('.src__gtitle')].map((h) => h.textContent.trim()),
      linkCount: links.length,
      hrefs: links.map((a) => a.getAttribute('href')),
      targets: [...new Set(links.map((a) => a.getAttribute('target')))],
      rels: [...new Set(links.map((a) => a.getAttribute('rel')))],
      pendingRows: rows.length,
      pendingText: rows.map((r) => r.querySelector('th').textContent.trim().slice(0, 20)),
      stat: document.querySelector('.src__stat') ? document.querySelector('.src__stat').textContent.replace(/\s+/g, ' ').trim() : null,
    });
  })()`));

  if (st.inPage && st.hasHost) ok('参考来源这一节已在附录最后');
  else bad('这一节没挂上');
  if (st.title) ok('标题：' + st.title);
  if (st.groups.length >= 4) ok('分了 ' + st.groups.length + ' 组：' + st.groups.join(' / ').slice(0, 60) + '…');
  else bad('分组数 = ' + st.groups.length);
  if (st.linkCount >= 8) ok('外链 ' + st.linkCount + ' 条'); else bad('外链只 ' + st.linkCount + ' 条');
  if (st.targets.length === 1 && st.targets[0] === '_blank') ok('外链都在新标签打开');
  else bad('target 不对：' + JSON.stringify(st.targets));
  if (st.rels.every((r) => /noopener/.test(r))) ok('外链都带 rel=noopener（安全）');
  else bad('rel 不对：' + JSON.stringify(st.rels));
  console.log('       统计条：' + st.stat);

  const hasPending = st.groups.some((g) => /尚未核实/.test(g));
  if (hasPending) ok('「尚未核实」那一段在');
  else bad('没有「尚未核实」那一段 —— 那才是这一节的重点');
  if (st.pendingRows >= 5) ok('未核实清单 ' + st.pendingRows + ' 条');
  else bad('未核实清单只有 ' + st.pendingRows + ' 条');
  const hasAigc = st.pendingText.some((t) => /视频|影像|壁画/.test(t));
  if (hasAigc) ok('清单里点明了 AIGC 影像（' + st.pendingText.filter((t) => /视频|影像|壁画/.test(t)).join('、') + '）');
  else bad('没点明 AIGC 影像 —— 这条最要紧');

  /* 逐条访问外链，确认真的能打开。
     死链比不写来源更糟，所以这条必须联网实测。 */
  console.log('\n  外链逐条实测：');
  let live = 0, dead = 0;
  for (const u of st.hrefs) {
    let s = '失败';
    try {
      const res = await fetch(u, {
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(20000),
      });
      s = String(res.status);
      if (res.ok) live++; else dead++;
    } catch (e) { dead++; s = e.name === 'TimeoutError' ? '超时' : '错误'; }
    console.log('    ' + s.padEnd(6) + u);
    await sleep(300);
  }
  if (dead === 0) ok('全部 ' + live + ' 条外链都能打开');
  else bad(dead + ' 条外链打不开 —— 死链比不写来源更糟');

  /* 模板里塞文字必须过 rich()，否则 **强调** 会原样显示成星号（踩过）。 */
  const sc = JSON.parse(await evalJs(`(() => {
    const host = document.getElementById('sources-host');
    const t = host.textContent || '';
    const m = t.match(/\\*\\*/g);
    return JSON.stringify({
      stars: m ? m.length : 0,
      sample: (t.match(/.{0,16}\\*\\*.{0,16}/) || [''])[0],
    });
  })()`));
  if (sc.stars === 0) ok('页面上没有字面的星号（** 都转成了粗体）');
  else bad('页面上有 ' + sc.stars + ' 处字面星号：' + sc.sample);

  await evalJs(`document.getElementById('src-act').scrollIntoView({block:'start'})`);
  await sleep(1400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'sources.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('\n  shots/sources.png');

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 参考来源自检通过\n'));
process.exit(fails ? 1 : 0);
