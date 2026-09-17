/* 逐条验证首页所有可点链接：href 指向哪里、文件在不在、点下去会怎样。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
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
const dbgPort = 9571;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      logs.push(m.params.response.status + ' ' + m.params.response.url);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('[exception] ' + ((m.params.exceptionDetails.exception || {}).description || '').slice(0, 120));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4200);

  console.log('\n=== 首页所有链接 ===');
  const links = JSON.parse(await evalJs(`(() => {
    const out = [];
    document.querySelectorAll('a').forEach((a, i) => {
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      out.push({
        i,
        text: (a.textContent || '').trim().slice(0, 20),
        hrefAttr: a.getAttribute('href'),
        hrefProp: a.href,
        visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
        top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
      });
    });
    return JSON.stringify(out, null, 1);
  })()`));
  links.forEach((l) => {
    console.log('  [' + l.i + '] ' + l.text.padEnd(22) +
      ' href=' + String(l.hrefAttr).padEnd(30) +
      ' visible=' + l.visible + ' rect=' + l.w + 'x' + l.h + '@' + l.left + ',' + l.top);
  });

  console.log('\n=== 底部链接点下去会到哪 ===');
  const bottom = JSON.parse(await evalJs(`(() => {
    const a = [...document.querySelectorAll('a')].find(x => (x.getAttribute('href')||'').indexOf('qiongnaieman') >= 0 && x.getBoundingClientRect().top > 2000);
    if (!a) return JSON.stringify({ found: false });
    return JSON.stringify({ found: true, href: a.href, text: a.textContent.trim() });
  })()`));
  console.log('  ' + JSON.stringify(bottom));

  // 真去访问那个地址，看返回什么
  if (bottom.found) {
    const u = new URL(bottom.href);
    const sub = await evalJs(`(async () => {
      const r = await fetch('${u.pathname}');
      const t = await r.text();
      return JSON.stringify({ status: r.status, bytes: t.length, head: t.slice(0, 80) });
    })()`);
    console.log('  访问结果 ' + sub);
  }

  console.log('\n=== 直接打开第二章 ===');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/qiongnaieman/index.html` });
  await sleep(4200);
  const ch2 = await evalJs(`JSON.stringify({
    title: document.title.slice(0, 30),
    render: document.body.dataset.render,
    bootErr: window.__XM_BOOT_ERR__ || null,
    bodyH: document.body.scrollHeight,
    innerH: window.innerHeight,
    mainH: (document.querySelector('main') || {}).scrollHeight,
    totalEls: document.querySelectorAll('*').length,
    reveals: document.querySelectorAll('.reveal').length,
    revealedIn: document.querySelectorAll('.reveal.is-in').length,
    h1: (document.querySelector('h1') || {}).textContent,
    h1Opacity: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).opacity : null,
    mainDisplay: document.querySelector('main') ? getComputedStyle(document.querySelector('main')).display : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    airOpacity: document.getElementById('air') ? getComputedStyle(document.getElementById('air')).opacity : null,
  }, null, 1)`);
  console.log(ch2);

  console.log('\n=== 视口内元素的实际样子 ===');
  const inView = await evalJs(`(() => {
    const out = [];
    document.querySelectorAll('.reveal').forEach((n, i) => {
      const r = n.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        out.push({
          i,
          cls: n.className,
          isIn: n.classList.contains('is-in'),
          opacity: getComputedStyle(n).opacity,
          top: Math.round(r.top),
          h: Math.round(r.height),
          text: (n.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 24),
        });
      }
    });
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(inView);

  console.log('\n=== file:// 打开第二章（用户的实际场景）===');
  await send('Page.navigate', { url: 'file:///D:/dsh/xiangmai/qiongnaieman/index.html' });
  await sleep(4500);
  const fileState = await evalJs(`JSON.stringify({
    render: document.body.dataset.render,
    bootErr: window.__XM_BOOT_ERR__ || null,
    revealedIn: document.querySelectorAll('.reveal.is-in').length,
    reveals: document.querySelectorAll('.reveal').length,
    h1Opacity: document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).opacity : null,
    heroTextOpacity: document.querySelector('.chapter-hero__part') ? getComputedStyle(document.querySelector('.chapter-hero__part')).opacity : null,
    airOpacity: document.getElementById('air') ? getComputedStyle(document.getElementById('air')).opacity : null,
    canvasAttr: document.getElementById('air') ? [document.getElementById('air').width, document.getElementById('air').height] : null,
    wheelNotes: document.querySelectorAll('.wnode').length,
    melodyNotes: document.querySelectorAll('.mnote').length,
    bodyH: document.body.scrollHeight,
    topbarHTML: (document.querySelector('.topbar') || {}).children.length,
  }, null, 1)`);
  console.log(fileState);

  await send('Page.navigate', { url: 'file:///D:/dsh/xiangmai/index.html' });
  await sleep(4200);
  const homeFile = await evalJs(`JSON.stringify({
    render: document.body.dataset.render,
    bootErr: window.__XM_BOOT_ERR__ || null,
    hasTex: document.querySelectorAll('.seg.has-tex').length,
    actnav: document.querySelectorAll('#act-dots button').length,
    bottomHref: (() => {
      const a = [...document.querySelectorAll('a')].find(x => (x.getAttribute('href')||'').indexOf('qiongnaieman') >= 0 && x.getBoundingClientRect().top > 2000);
      return a ? a.href : null;
    })(),
  }, null, 1)`);
  console.log('\n=== file:// 打开首页 ===');
  console.log(homeFile);

  console.log('\n=== 网络错误 ===');
  logs.slice(0, 8).forEach((l) => console.log('  ' + l));

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
