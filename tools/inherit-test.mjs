/* 传承之路 · 引擎自检
   验规则本身：选错必须能重选、重选只能选对的、选对给案例。
   跟"入口"分开测（入口见 entry-test.mjs）。 */
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
const userDir = join(root, '.chrome-game2');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9981',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

const G = (lvl) => `http://127.0.0.1:${PORT}/game/index.html?level=${lvl}`;

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9981/json/list')).json();
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
        mime: (m.params.response.headers['content-type'] || '') });
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
  const snap = () => evalJs(`(() => {
    /* 现在有两个 .g-video：环境片（循环）和剧情片。
       取**正在放的那一段剧情片** —— 用 loop 区分：
       环境片 loop=true，剧情片 loop=false。
       原来直接取第一个 .g-video，补上环境片之后取到的是环境片（踩过）。 */
    const all = [...document.querySelectorAll('.g-video')];
    const v = all.find((x) => !x.loop && x.classList.contains('is-on')) ||
              all.find((x) => !x.loop) || all[0];
    const intro = all.find((x) => x.loop);
    const c = document.getElementById('g-case');
    return JSON.stringify({
      phase: window.__XM_GAME__.state().phase,
      tried: window.__XM_GAME__.state().tried,
      title: document.getElementById('g-title').textContent.trim(),
      text: document.getElementById('g-text').textContent.trim(),
      bg: document.getElementById('inherit').dataset.bg,
      video: v && v.getAttribute('src') ? v.getAttribute('src').split('/').pop() : null,
      videoW: v ? v.videoWidth : 0,
      introPlaying: !!(intro && intro.classList.contains('is-on') && !intro.paused),
      choicesOn: !document.getElementById('g-choices').hidden &&
                 document.getElementById('g-choices').querySelectorAll('.g-choice').length > 0,
      retryOn: !document.getElementById('g-next').hidden,
      retryLabel: document.getElementById('g-next').textContent.trim(),
      caseOn: !c.hidden,
      name: c.querySelector('.g-case__name') ? c.querySelector('.g-case__name').textContent.trim() : null,
      fact: c.querySelector('.g-case__fact') ? c.querySelector('.g-case__fact').textContent.trim() : null,
    });
  })()`).then(JSON.parse);

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  /* ================= 关卡一：维吾尔族 · 十二木卡姆 ================= */
  console.log('\n[传承之路 · 引擎自检]\n');
  console.log('  ── 维吾尔族 · 十二木卡姆 ──');
  await send('Page.navigate', { url: G('muqam') });
  await sleep(3400);

  const a0 = await snap();
  if (a0.choicesOn) ok('开场给两个选项'); else bad('开场没有选项');
  if (/戈壁/.test(a0.title)) ok('开场：' + a0.title); else bad('开场不对：' + a0.title);

  /* 选错。
     用 data-ok 找，**不要按下标** —— 选项顺序由 levels-data.js 决定，
     我调过一次顺序（把正确的放前面），按下标点的测试就点反了、
     报"没闪回 / tried = 0"这种假失败（踩过）。 */
  const err = await evalJs(`!!document.querySelector('.g-choice[data-ok="0"]')`);
  if (!err) bad('找不到错误选项（data-ok="0"）');
  await evalJs(`document.querySelector('.g-choice[data-ok="0"]').click()`);
  await sleep(1500);
  const a1 = await snap();
  console.log('      选错 ' + JSON.stringify({ text: a1.text, video: a1.video, retry: a1.retryLabel }));
  if (/没能走出戈壁/.test(a1.text)) ok('给出后果：' + a1.text); else bad('文案不对：' + a1.text);
  if (/qon-lost/.test(a1.video || '')) ok('播失传那段：' + a1.video); else bad('视频不对：' + a1.video);
  if (a1.videoW > 0) ok('视频解出画面 ' + a1.videoW + 'px'); else bad('视频没画面');
  if (a1.bg === 'gobi-lost') ok('背景切成失传色调'); else bad('背景不对：' + a1.bg);
  if (a1.retryOn && /回到选择/.test(a1.retryLabel)) ok('立刻给出「' + a1.retryLabel + '」');
  else bad('没有回退出口 —— 玩家会卡住');
  if (!a1.caseOn) ok('选错时不给案例（对）'); else bad('选错却也给了案例');

  // 闪回
  await evalJs(`document.getElementById('g-next').click()`);
  await sleep(900);
  const a2 = await snap();
  if (a2.choicesOn && a2.phase === 'intro') ok('闪回成功，两个选项回来');
  else bad('没闪回：' + JSON.stringify({ phase: a2.phase, choicesOn: a2.choicesOn }));
  /* 闪回时**两个选项都必须在、而且都能点** —— 那才是"逼你重选"。
     （原来这里验 a2.tried === 1，那是拿"累计错误数"当判据；
     闪回会调 renderIntro() 把 tried 归零，所以恒为 0，是条假失败。
     tried 表示"这一轮有没有走弯路"，归零是对的。） */
  const usable = JSON.parse(await evalJs(`(() => {
    const cs = [...document.querySelectorAll('.g-choice')];
    return JSON.stringify({
      n: cs.length,
      wrong: cs.filter((c) => c.dataset.ok === '0').length,
      right: cs.filter((c) => c.dataset.ok === '1').length,
      clickable: cs.every((c) => getComputedStyle(c).pointerEvents !== 'none'),
    });
  })()`));
  if (usable.n === 2 && usable.wrong === 1 && usable.right === 1) {
    ok('闪回后两个选项都在（一错一对）');
  } else bad('闪回后选项不对：' + JSON.stringify(usable));
  if (usable.clickable) ok('两个选项都可点（能重选）');
  else bad('选项不可点 —— 玩家会卡住');

  // 选对
  await evalJs(`document.querySelector('.g-choice[data-ok="1"]').click()`);
  await sleep(1700);
  const a3 = await snap();
  if (/qon-live/.test(a3.video || '')) ok('选对播活着那段：' + a3.video);
  else bad('视频不对：' + a3.video);
  if (a3.videoW > 0) ok('视频解出画面 ' + a3.videoW + 'px'); else bad('视频没画面');

  await sleep(7000);   // 等活着那段播完 → 案例
  const a4 = await snap();
  console.log('      案例 ' + JSON.stringify({ name: a4.name, fact: a4.fact, video: a4.video }));
  if (a4.caseOn) ok('案例已显示'); else bad('案例没出来');
  if (/玉苏普|托合提/.test(a4.name || '')) ok('人物：' + a4.name); else bad('人物不对：' + a4.name);
  if (/20/.test(a4.fact || '')) ok('事实：' + a4.fact); else bad('事实不对：' + a4.fact);
  if (/qon-case/.test(a4.video || '')) ok('案例视频也播了：' + a4.video); else bad('案例视频没播');

  // 收束
  await evalJs(`document.getElementById('g-next').click()`);
  await sleep(1100);
  const a5 = await snap();
  if (a5.phase === 'end') ok('收束到结尾屏'); else bad('没收束：' + a5.phase);
  if (!a5.choicesOn) ok('结尾屏没有残留选项'); else bad('结尾屏还显示着选项');
  if (a5.retryOn && /旋律图/.test(a5.retryLabel)) ok('出口是「' + a5.retryLabel + '」');
  else bad('结尾出口不对：' + a5.retryLabel);

  /* ================= 关卡二：藏族 · 格萨尔 ================= */
  console.log('\n  ── 藏族 · 格萨尔 ──');
  await send('Page.navigate', { url: G('gesar') });
  await sleep(3400);
  const b0 = await snap();
  if (/草原/.test(b0.title)) ok('开场：' + b0.title); else bad('开场不对：' + b0.title);

  // 这次**不选错**，直接选对 —— 验另一条路
  await evalJs(`document.querySelector('.g-choice[data-ok="1"]').click()`);
  await sleep(1700);
  const b1 = await snap();
  if (/tib-live/.test(b1.video || '')) ok('选对播活着那段：' + b1.video); else bad('视频不对：' + b1.video);

  await sleep(7000);
  const b2 = await snap();
  console.log('      案例 ' + JSON.stringify({ name: b2.name, fact: b2.fact }));
  if (/桑珠/.test(b2.name || '')) ok('人物：' + b2.name); else bad('人物不对：' + b2.name);
  if (/60/.test(b2.fact || '')) ok('事实：' + b2.fact); else bad('事实不对：' + b2.fact);

  // 这一关没选错过 → 收束文案应当是"一次就走对了"
  await evalJs(`document.getElementById('g-next').click()`);
  await sleep(1100);
  const b3 = await snap();
  if (/一次就走对/.test(b3.text)) ok('没走弯路时文案不同：' + b3.text);
  else bad('文案没区分：' + b3.text);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'game-end.png'), Buffer.from(shot.result.data, 'base64'));

  console.log('\n  视频请求：');
  [...new Set(net.map((n) => n.s + ' ' + n.f + '  (' + n.mime + ')'))].forEach((s) => console.log('    ' + s));
  const badMime = net.filter((n) => n.s === 200 && !/webm/.test(n.mime));
  if (badMime.length) bad('视频 MIME 不对：' + JSON.stringify(badMime.slice(0, 2)));
  else if (net.length) ok('视频 MIME 正确');

  const real = errs.filter((e) => !/favicon/i.test(e));
  if (!real.length) ok('无运行时异常'); else real.slice(0, 3).forEach((e) => bad(e));

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 引擎自检通过\n'));
process.exit(fails ? 1 : 0);
