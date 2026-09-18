/* 传承之路自检：视频有没有加载、选错会不会闪回、选对会不会给案例。 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
/* .webm 的 MIME 必须对 —— 发成 octet-stream 浏览器拒播，还不报错（踩过两次） */
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
const userDir = join(root, '.chrome-game');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9961',
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
      const list = await (await fetch('http://127.0.0.1:9961/json/list')).json();
      target = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch {}
    if (!target) await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const net = []; const errs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      errs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 140));
    }
    if (m.method === 'Network.responseReceived' && /\.webm/.test(m.params.response.url)) {
      net.push({ f: m.params.response.url.split('/').pop(), s: m.params.response.status,
        mime: (m.params.response.headers['content-type'] || m.params.response.headers['Content-Type'] || '') });
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/fulu/index.html` });
  await sleep(3600);

  // 滚到游戏那一屏
  await evalJs(`document.getElementById('inherit-act').scrollIntoView()`);
  await sleep(1200);

  console.log('\n[传承之路自检]');

  const st = JSON.parse(await evalJs(`(() => {
    const g = window.__XM_GAME__;
    const ch = [...document.querySelectorAll('.g-choice')];
    return JSON.stringify({
      hasGame: !!g,
      state: g ? g.state() : null,
      scenes: g ? g.scenes() : null,
      title: document.getElementById('g-title').textContent.trim(),
      choices: ch.map((b) => ({
        ok: b.dataset.ok,
        label: b.querySelector('.g-choice__label').textContent.trim(),
      })),
    });
  })()`));
  console.log('       ' + JSON.stringify(st, null, 1).split('\n').slice(0, 14).join('\n       '));

  if (st.hasGame) ok('游戏已挂上'); else bad('游戏没挂上');
  if (st.scenes && st.scenes.join(',') === 'gobi,steppe') ok('两幕就位：戈壁 → 草原');
  else bad('幕不对：' + JSON.stringify(st.scenes));
  if (st.choices.length === 2) ok('两个选项就位'); else bad('选项数 = ' + st.choices.length);
  const wrong = st.choices.find((c) => c.ok === '0');
  const right = st.choices.find((c) => c.ok === '1');
  if (wrong && /录下来|音乐厅/.test(wrong.label)) ok('错误选项正确：' + wrong.label.slice(0, 20) + '…');
  else bad('错误选项不对：' + JSON.stringify(wrong));
  if (right && /留在戈壁|跟着他学/.test(right.label)) ok('正确选项正确：' + right.label.slice(0, 20) + '…');
  else bad('正确选项不对：' + JSON.stringify(right));

  /* ---- 选错：应当播失传那段，然后给出"回到选择" ---- */
  console.log('\n  · 选错这条路');
  await evalJs(`document.querySelectorAll('.g-choice')[0].click()`);
  await sleep(1400);
  const w1 = JSON.parse(await evalJs(`(() => {
    const v = document.querySelector('.g-video');
    return JSON.stringify({
      title: document.getElementById('g-title').textContent.trim(),
      text: document.getElementById('g-text').textContent.trim(),
      bg: document.getElementById('inherit').dataset.bg,
      videoSrc: v ? (v.getAttribute('src') || '').split('/').pop() : null,
      videoReady: v ? v.readyState : null,
      videoW: v ? v.videoWidth : null,
      retry: !document.getElementById('g-next').hidden,
      retryLabel: document.getElementById('g-next').textContent.trim(),
      caseHidden: document.getElementById('g-case').hidden,
    });
  })()`));
  console.log('       ' + JSON.stringify(w1));
  if (/没能走出戈壁/.test(w1.text)) ok('给出后果：' + w1.text);
  else bad('选错后的文案不对：' + w1.text);
  if (w1.videoSrc && /qon-lost/.test(w1.videoSrc)) ok('播的是失传那段：' + w1.videoSrc);
  else bad('视频不对：' + w1.videoSrc);
  if (w1.videoW > 0) ok('视频解出画面 ' + w1.videoW + 'px');
  else bad('视频没画面，ready=' + w1.videoReady);
  if (w1.bg === 'gobi-lost') ok('背景切成"失传"色调'); else bad('背景没切：' + w1.bg);
  if (w1.retry && /回到选择/.test(w1.retryLabel)) ok('给出「' + w1.retryLabel + '」，能闪回');
  else bad('没有闪回入口：' + JSON.stringify(w1));
  if (w1.caseHidden) ok('选错时**不**给成功案例（对）');
  else bad('选错却也显示了案例');

  /* ---- 闪回：只能重选 ---- */
  await evalJs(`document.getElementById('g-next').click()`);
  await sleep(900);
  const back = JSON.parse(await evalJs(`(() => {
    const ch = [...document.querySelectorAll('.g-choice')];
    return JSON.stringify({
      phase: window.__XM_GAME__.state().phase,
      choicesVisible: !document.getElementById('g-choices').hidden,
      n: ch.length,
      tried: window.__XM_GAME__.state().tried,
    });
  })()`));
  console.log('       ' + JSON.stringify(back));
  if (back.choicesVisible && back.n === 2) ok('闪回成功，两个选项回来了');
  else bad('没闪回：' + JSON.stringify(back));
  if (back.phase === 'intro') ok('回到选择阶段（phase=intro）'); else bad('阶段不对：' + back.phase);
  if (back.tried === 1) ok('记录了一次错误（tried=1）'); else bad('tried = ' + back.tried);

  /* ---- 选对：活着那段 → 成功案例 ---- */
  console.log('\n  · 选对这条路');
  await evalJs(`document.querySelectorAll('.g-choice')[1].click()`);
  await sleep(1600);
  const r1 = JSON.parse(await evalJs(`(() => {
    const v = document.querySelector('.g-video');
    return JSON.stringify({
      text: document.getElementById('g-text').textContent.trim(),
      videoSrc: v ? (v.getAttribute('src') || '').split('/').pop() : null,
      videoW: v ? v.videoWidth : null,
    });
  })()`));
  console.log('       ' + JSON.stringify(r1));
  if (r1.videoSrc && /qon-live/.test(r1.videoSrc)) ok('播的是活着那段：' + r1.videoSrc);
  else bad('视频不对：' + r1.videoSrc);
  if (r1.videoW > 0) ok('视频解出画面 ' + r1.videoW + 'px'); else bad('视频没画面');

  // 等它播完 → 应当出案例
  await sleep(7000);
  const r2 = JSON.parse(await evalJs(`(() => {
    const c = document.getElementById('g-case');
    return JSON.stringify({
      caseShown: !c.hidden,
      name: c.querySelector('.g-case__name') ? c.querySelector('.g-case__name').textContent.trim() : null,
      year: c.querySelector('.g-case__year') ? c.querySelector('.g-case__year').textContent.trim() : null,
      fact: c.querySelector('.g-case__fact') ? c.querySelector('.g-case__fact').textContent.trim() : null,
      nextLabel: document.getElementById('g-next').textContent.trim(),
      videoSrc: (document.querySelector('.g-video') || {}).src ?
        document.querySelector('.g-video').getAttribute('src').split('/').pop() : null,
    });
  })()`));
  console.log('       ' + JSON.stringify(r2));
  if (r2.caseShown) ok('成功案例已显示'); else bad('案例没出来');
  if (r2.name && /玉苏普|托合提/.test(r2.name)) ok('案例人物：' + r2.name);
  else bad('案例人物不对：' + r2.name);
  if (r2.fact && r2.fact.length > 4) ok('案例事实已填：' + r2.fact);
  else bad('案例事实是空的');
  if (/下一幕|继续/.test(r2.nextLabel)) ok('给出「' + r2.nextLabel + '」'); else bad('按钮不对：' + r2.nextLabel);

  /* ---- 进第二幕 ---- */
  await evalJs(`document.getElementById('g-next').click()`);
  await sleep(1400);
  const s2 = JSON.parse(await evalJs(`(() => {
    const ch = [...document.querySelectorAll('.g-choice')];
    return JSON.stringify({
      scene: window.__XM_GAME__.state().scene,
      title: document.getElementById('g-title').textContent.trim(),
      bg: document.getElementById('inherit').dataset.bg,
      labels: ch.map((b) => b.querySelector('.g-choice__label').textContent.trim()),
    });
  })()`));
  console.log('       ' + JSON.stringify(s2));
  if (s2.scene === 1) ok('进入第二幕'); else bad('没进第二幕：' + s2.scene);
  if (/草原/.test(s2.title)) ok('第二幕文案对：' + s2.title); else bad('第二幕文案不对：' + s2.title);
  if (s2.bg === 'steppe') ok('背景切成草原'); else bad('背景不对：' + s2.bg);
  if (s2.labels.some((l) => /图书馆/.test(l))) ok('第二幕错误选项：图书馆那条');
  else bad('第二幕选项不对：' + JSON.stringify(s2.labels));
  if (s2.labels.some((l) => /坐在草原上/.test(l))) ok('第二幕正确选项：坐在草原上那条');
  else bad('第二幕缺正确选项：' + JSON.stringify(s2.labels));

  /* ---- 走完第二幕：选错 → 闪回 → 选对 → 案例 → 结尾 ---- */
  console.log('\n  · 第二幕走完');
  await evalJs(`document.querySelectorAll('.g-choice')[0].click()`);   // 选错
  await sleep(1200);
  const w2 = JSON.parse(await evalJs(`(() => {
    const v = document.querySelector('.g-video');
    return JSON.stringify({
      text: document.getElementById('g-text').textContent.trim(),
      videoSrc: v ? (v.getAttribute('src') || '').split('/').pop() : null,
      retry: !document.getElementById('g-next').hidden,
    });
  })()`));
  console.log('       ' + JSON.stringify(w2));
  if (/没能走出草原/.test(w2.text)) ok('第二幕同样给出后果：' + w2.text);
  else bad('第二幕选错文案不对：' + w2.text);
  if (w2.videoSrc && /tib-lost/.test(w2.videoSrc)) ok('播的是藏族失传那段');
  else bad('视频不对：' + w2.videoSrc);
  if (w2.retry) ok('第二幕也能闪回'); else bad('第二幕没有闪回入口');

  await evalJs(`document.getElementById('g-next').click()`);           // 闪回
  await sleep(800);
  await evalJs(`document.querySelectorAll('.g-choice')[1].click()`);   // 选对
  await sleep(1600);
  const r3 = JSON.parse(await evalJs(`(() => {
    const v = document.querySelector('.g-video');
    return JSON.stringify({
      videoSrc: v ? (v.getAttribute('src') || '').split('/').pop() : null,
      videoW: v ? v.videoWidth : null,
    });
  })()`));
  if (r3.videoSrc && /tib-live/.test(r3.videoSrc)) ok('第二幕选对播活着那段');
  else bad('第二幕选对视频不对：' + r3.videoSrc);

  await sleep(7000);
  const r4 = JSON.parse(await evalJs(`(() => {
    const c = document.getElementById('g-case');
    return JSON.stringify({
      caseShown: !c.hidden,
      name: c.querySelector('.g-case__name') ? c.querySelector('.g-case__name').textContent.trim() : null,
      year: c.querySelector('.g-case__year') ? c.querySelector('.g-case__year').textContent.trim() : null,
      fact: c.querySelector('.g-case__fact') ? c.querySelector('.g-case__fact').textContent.trim() : null,
      nextLabel: document.getElementById('g-next').textContent.trim(),
    });
  })()`));
  console.log('       ' + JSON.stringify(r4));
  if (r4.name && /桑珠/.test(r4.name)) ok('第二幕案例人物：' + r4.name);
  else bad('第二幕案例人物不对：' + r4.name);
  if (/60/.test(r4.fact)) ok('案例事实：' + r4.fact); else bad('案例事实不对：' + r4.fact);
  if (/2009/.test(r4.year)) ok('年份对：' + r4.year); else bad('年份不对：' + r4.year);

  /* ---- 结尾 ---- */
  await evalJs(`document.getElementById('g-next').click()`);
  await sleep(1200);
  const end = JSON.parse(await evalJs(`(() => {
    const g = window.__XM_GAME__;
    return JSON.stringify({
      phase: g.state().phase,
      title: document.getElementById('g-title').textContent.trim(),
      text: document.getElementById('g-text').textContent.trim(),
      progress: document.getElementById('g-progress').textContent.trim(),
      choicesHidden: document.getElementById('g-choices').hidden,
    });
  })()`));
  console.log('       ' + JSON.stringify(end));
  if (end.phase === 'end') ok('两幕走完，进入结尾');
  else bad('没进结尾：' + end.phase);
  if (/结尾页待做/.test(end.progress)) ok('结尾页位置已留出（待做）');
  else bad('结尾标记不对：' + end.progress);

  /* 结尾屏上**不能**还留着上一幕的选项 ——
     踩过：.g-choices 的 display:grid 盖掉了 hidden 属性，
     结果两屏叠在一起（截图里看得很清楚）。 */
  const lo = JSON.parse(await evalJs(`(() => {
    const c = document.getElementById('g-choices');
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return JSON.stringify({
      hidden: c.hidden, display: cs.display,
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none',
      buttons: c.querySelectorAll('.g-choice').length,
    });
  })()`));
  console.log('       结尾屏上的选项 ' + JSON.stringify(lo));
  if (!lo.visible) ok('结尾屏上没有残留的选项');
  else bad('结尾屏还显示着选项（display=' + lo.display + '，' + lo.buttons + ' 个按钮）');

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'game-scene2.png'), Buffer.from(shot.result.data, 'base64'));

  console.log('\n  视频请求：');
  [...new Set(net.map((n) => n.s + ' ' + n.f + '  (' + n.mime + ')'))].forEach((s) => console.log('    ' + s));
  const badMime = net.filter((n) => n.s === 200 && !/webm/.test(n.mime));
  if (badMime.length) bad('有视频的 MIME 不对：' + JSON.stringify(badMime.slice(0, 2)));
  else if (net.length) ok('视频 MIME 正确');

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 传承之路自检通过\n'));
process.exit(fails ? 1 : 0);
