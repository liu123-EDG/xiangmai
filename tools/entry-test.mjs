/* 传承之路 · 入口与关卡自检
   验三件事：
     ① 点藏族音符 → 进 game/?level=gesar
     ② 点其余六个 → 不跳转，明说"还在制作中"
     ③ 每一关进去玩的是对的那一幕（戈壁 / 草原） */
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
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
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
const userDir = join(root, '.chrome-entry');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9971',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9971/json/list')).json();
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
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 140));
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

  console.log('\n[传承之路 · 入口自检]');

  /* ---- ① 附录页：音符链接指向对不对 ----
     **先解锁**。附录在第四章圆圈之后，没解锁时点音符会被那道门拦下
     （"先去第四章把圆圈点满"）—— 那是设计的行为，不是 bug。
     这里要验的是解锁之后的路由，所以先把钥匙放进 localStorage。 */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(1200);
  await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap', '1')`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(3400);

  const unlocked = await evalJs(`document.querySelectorAll('.wnode.is-locked, .mnote.is-locked').length`);
  if (unlocked === 0) ok('已解锁（音符不再带锁标记）');
  else bad('还是锁着 ' + unlocked + ' 个 —— 后面的路由测不了');

  const links = JSON.parse(await evalJs(`(() => {
    const notes = [...document.querySelectorAll('.mnote')];
    return JSON.stringify({
      noteCount: notes.length,
      hrefs: notes.map((a) => ({ id: a.dataset.id, href: a.getAttribute('href') })),
      /* 入口是小字链接还是卡片，都按 .g-invite 找 ——
         一开始是小字链接，用户说"不太明显"，改成卡片后类名统一到这个。
         选择器写死旧名字的话，改版就会报假失败（刚踩过）。 */
      wheelEnter: (() => { const a = document.querySelector('.g-invite');
        return a ? a.getAttribute('href') : null; })(),
      melodyEnter: (() => { const a = document.querySelector('.g-invite--slim');
        return a ? a.getAttribute('href') : null; })(),
      inviteTexts: [...document.querySelectorAll('.g-invite')].map((a) => ({
        tag: a.querySelector('.g-invite__tag') ? a.querySelector('.g-invite__tag').textContent.trim() : null,
        title: a.querySelector('.g-invite__title') ? a.querySelector('.g-invite__title').textContent.trim() : null,
        w: Math.round(a.getBoundingClientRect().width),
      })),
    });
  })()`));
  console.log('       ' + JSON.stringify(links.inviteTexts));
  console.log('       ' + JSON.stringify({ noteCount: links.noteCount, wheelEnter: links.wheelEnter,
    melodyEnter: links.melodyEnter }));
  if (links.noteCount === 8) ok('八个音符就位'); else bad('音符数 = ' + links.noteCount);
  if (links.melodyEnter && /game\/index\.html\?level=gesar/.test(links.melodyEnter)) {
    ok('藏族入口指向格萨尔那一关');
  } else bad('藏族入口不对：' + links.melodyEnter);
  if (links.wheelEnter && /game\/index\.html\?level=muqam/.test(links.wheelEnter)) {
    ok('木卡姆入口指向戈壁那一关');
  } else bad('木卡姆入口不对：' + links.wheelEnter);

  /* ---- ② 点藏族音符 → 应当跳去 game/?level=gesar ---- */
  const tib = links.hrefs.find((h) => h.id === 'tibetan-gesar');
  if (!tib) bad('找不到藏族的音符');
  else {
    await evalJs(`document.querySelector('.mnote[data-id="tibetan-gesar"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }))`);
    await sleep(2200);
    const url = await evalJs('location.pathname + location.search');
    if (/game\/index\.html\?level=gesar/.test(url)) ok('点藏族音符 → ' + url);
    else bad('点藏族没进关卡，当前在 ' + url);
  }

  /* ---- ③ 关卡页：玩的是对的那一幕 ---- */
  const g = JSON.parse(await evalJs(`(() => {
    const gm = window.__XM_GAME__;
    return JSON.stringify({
      level: window.__XM_LEVEL__,
      /* gm.level() 返回整个关卡配置，这里取它的 scene 字段（gobi/steppe）。 */
      scene: gm && gm.level ? gm.level().scene : null,
      title: document.getElementById('g-title').textContent.trim(),
      kicker: document.getElementById('g-kicker').textContent.trim(),
      progress: document.getElementById('g-progress').textContent.trim(),
      choices: [...document.querySelectorAll('.g-choice__label')].map((b) => b.textContent.trim()),
      docTitle: document.title,
      backHref: (() => { const a = document.querySelector('.g-back'); return a ? a.getAttribute('href') : null; })(),
    });
  })()`));
  console.log('       ' + JSON.stringify(g));
  if (g.level === 'gesar') ok('level 参数读到 gesar'); else bad('level = ' + g.level);
  /* g.scene 现在直接是关卡配置里的 scene 字段（'steppe' / 'gobi'）。 */
  if (g.scene === 'steppe') ok('这一关是草原那一幕');
  else bad('幕不对：' + JSON.stringify(g.scene));
  if (/草原/.test(g.title)) ok('开场文案对：' + g.title); else bad('开场文案不对：' + g.title);
  if (g.progress && /藏族/.test(g.progress)) ok('进度写着：' + g.progress); else bad('进度不对：' + g.progress);
  if (g.choices.some((c) => /图书馆/.test(c))) ok('选项是格萨尔那套'); else bad('选项不对：' + JSON.stringify(g.choices));
  if (/格萨尔/.test(g.docTitle)) ok('标签页标题对：' + g.docTitle); else bad('标题不对：' + g.docTitle);
  if (g.backHref && /fulu/.test(g.backHref)) ok('返回旋律图的链接在'); else bad('返回链接不对：' + g.backHref);

  /* ---- ④ 另一关：?level=muqam ---- */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/game/index.html?level=muqam` });
  await sleep(3200);
  const m = JSON.parse(await evalJs(`(() => {
    const gm = window.__XM_GAME__;
    return JSON.stringify({
      /* 取关卡配置里的 scene 字段（gobi / steppe），
         和上面 gesar 那块保持同一种判据。 */
      scene: gm && gm.level ? gm.level().scene : null,
      title: document.getElementById('g-title').textContent.trim(),
      progress: document.getElementById('g-progress').textContent.trim(),
      choices: [...document.querySelectorAll('.g-choice__label')].map((b) => b.textContent.trim()),
    });
  })()`));
  console.log('       ' + JSON.stringify(m));
  if (m.scene === 'gobi') ok('木卡姆那一关是戈壁那一幕'); else bad('幕不对：' + m.scene);
  if (/戈壁/.test(m.title)) ok('开场文案对：' + m.title); else bad('开场文案不对：' + m.title);
  if (m.choices.some((c) => /音乐厅/.test(c))) ok('选项是木卡姆那套'); else bad('选项不对：' + JSON.stringify(m.choices));

  /* ---- ⑤ 参数给错时要给一句实话，不能留白屏 ---- */
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/game/index.html?level=nonsense` });
  await sleep(2600);
  const badParam = JSON.parse(await evalJs(`JSON.stringify({
    title: document.getElementById('g-title').textContent.trim(),
    text: document.getElementById('g-text').textContent.trim(),
  })`));
  console.log('       ' + JSON.stringify(badParam));
  if (/没有这一关/.test(badParam.title)) ok('参数给错时明说「' + badParam.title + '」');
  else bad('参数给错时没提示：' + badParam.title);

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 入口自检通过\n'));
process.exit(fails ? 1 : 0);
