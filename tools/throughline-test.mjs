/* 纵贯线自检：路径是否生成、滚动时是否画出来、末端是否落在下一章入口上。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9641;
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
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[纵贯线自检]');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/qiongnaieman/index.html` });
  await sleep(4500);

  const info = JSON.parse(await evalJs(`(() => {
    const path = document.querySelector('.tl__path');
    const end = document.querySelector('.tl__end');
    const link = document.querySelector('.chapter-nav .next');
    const lr = link ? link.getBoundingClientRect() : null;
    const er = end ? end.getBoundingClientRect() : null;
    return JSON.stringify({
      hasPath: !!path,
      dLen: path ? path.getAttribute('d').length : 0,
      total: path && path.getTotalLength ? Math.round(path.getTotalLength()) : 0,
      dasharray: path ? path.style.strokeDasharray : '',
      hasHead: !!document.querySelector('.tl__headshape'),
      hasEnd: !!end,
      linkText: link ? link.textContent.trim() : '',
      linkHref: link ? link.getAttribute('href') : '',
      endXY: er ? [Math.round(er.left), Math.round(er.top)] : null,
      linkXY: lr ? [Math.round(lr.left + lr.width/2), Math.round(lr.top + lr.height/2)] : null,
      bodyH: document.body.scrollHeight,
    });
  })()`));
  console.log('       ' + JSON.stringify(info));

  if (info.hasPath && info.dLen > 20) ok('路径已生成（d 长度 ' + info.dLen + '）');
  else bad('路径未生成');
  if (info.total > 800) ok('路径总长 ' + info.total + 'px'); else bad('路径过短：' + info.total);
  if (info.hasHead) ok('音头已绘制'); else bad('音头缺失');
  if (info.hasEnd) ok('末端落点已绘制'); else bad('末端落点缺失');
  if (info.linkHref && info.linkHref.indexOf('dastan') >= 0) ok('末端接的是下一章：' + info.linkHref);
  else bad('末端没接上下一章，实际 ' + info.linkHref);

  // 末端是否落在链接上（误差 40px 内）
  if (info.endXY && info.linkXY) {
    const dx = Math.abs(info.endXY[0] - info.linkXY[0]);
    const dy = Math.abs(info.endXY[1] - info.linkXY[1]);
    if (dx < 60 && dy < 60) ok('末端与链接重合（偏差 ' + dx + ',' + dy + 'px）');
    else bad('末端没落到链接上：末端 ' + info.endXY + ' 链接 ' + info.linkXY);
  }

  // 滚动：线应该越画越多
  const offs = [];
  for (const frac of [0, 0.3, 0.6, 1]) {
    const max = info.bodyH - 900;
    await evalJs(`window.scrollTo(0, ${Math.round(max * frac)})`);
    await sleep(700);
    const s = JSON.parse(await evalJs(`(() => {
      const p = document.querySelector('.tl__path');
      const e = document.querySelector('.tl__end');
      return JSON.stringify({
        off: parseFloat(p.style.strokeDashoffset || '0'),
        endOp: e ? getComputedStyle(e).opacity : '',
        scroll: Math.round(window.scrollY),
      });
    })()`));
    offs.push(s);
    console.log('       scroll=' + String(s.scroll).padStart(6) + '  dashoffset=' +
      String(s.off).padStart(8) + '  末端透明度=' + s.endOp);
  }

  const decreasing = offs.every((s, i) => i === 0 || s.off <= offs[i - 1].off + 1);
  const drew = offs[offs.length - 1].off < offs[0].off - 100;
  if (drew && decreasing) ok('滚动时线被逐步画出来（' + Math.round(offs[0].off) + ' → ' + Math.round(offs[offs.length-1].off) + '）');
  else bad('线没有随滚动延伸：' + JSON.stringify(offs.map((s) => s.off)));

  for (const [name, frac] of [['tl-0', 0.02], ['tl-1', 0.5], ['tl-2', 0.99]]) {
    await evalJs(`window.scrollTo(0, ${Math.round((info.bodyH - 900) * frac)})`);
    await sleep(800);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', name + '.png'), Buffer.from(shot.result.data, 'base64'));
  }
  console.log('       shots/tl-0.png  shots/tl-1.png  shots/tl-2.png');

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 纵贯线自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
