/* 麦西热甫互动自检：加人、纹样联动、满圈重置、音频分层。 */
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
const dbgPort = 9651;
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
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 150));
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[麦西热甫互动自检]');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(4500);

  const base = JSON.parse(await evalJs(`(() => {
    const c = document.getElementById('air');
    return JSON.stringify({
      render: document.body.dataset.render,
      bootErr: window.__XM_BOOT_ERR__ || null,
      hasCircle: !!window.__XM_CIRCLE__,
      count: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.count : -1,
      max: window.__XM_CIRCLE__ ? window.__XM_CIRCLE__.max : -1,
      people: document.querySelectorAll('.mq__person').length,
      canvas: c ? [c.width, c.height] : null,
      shape: document.querySelectorAll('.mq__ring').length,
    });
  })()`));
  console.log('       ' + JSON.stringify(base));

  if (base.bootErr) bad('启动错误：' + JSON.stringify(base.bootErr).slice(0, 130));
  else ok('启动无错');
  if (base.render === 'pattern') ok('渲染后端 = pattern（程序化纹样）');
  else bad('渲染后端 = ' + base.render + '，应为 pattern');
  if (base.hasCircle) ok('圆圈已初始化'); else bad('圆圈没初始化');
  if (base.count === 0 && base.people === 0) ok('初始 0 人'); else bad('初始人数异常');
  if (base.shape >= 4) ok('地面圈层 ' + base.shape + ' 条'); else bad('地面圈层不足');

  // 点 5 次
  for (let i = 0; i < 5; i++) {
    await evalJs(`document.querySelector('.mq__hit').dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
    await sleep(260);
  }
  const after5 = JSON.parse(await evalJs(`(() => {
    const r = document.getElementById('mq-readout');
    const svg = document.querySelector('.mq');
    return JSON.stringify({
      count: window.__XM_CIRCLE__.count,
      people: document.querySelectorAll('.mq__person').length,
      heat: getComputedStyle(svg).getPropertyValue('--mq-heat').trim(),
      readout: r ? r.textContent.trim().slice(0, 30) : '',
      numText: document.querySelector('.mq__count').textContent,
    });
  })()`));
  console.log('       ' + JSON.stringify(after5));
  if (after5.count === 5) ok('点 5 次 → 5 人'); else bad('人数 = ' + after5.count);
  if (after5.people === 5) ok('圈里画出 5 个人'); else bad('画出 ' + after5.people + ' 个人');
  if (parseFloat(after5.heat) > 0.15) ok('纹样热度已联动：--mq-heat=' + after5.heat);
  else bad('纹样热度没动：' + after5.heat);
  if (after5.numText === '5') ok('中心读数 = 5'); else bad('中心读数 = ' + after5.numText);
  if (after5.readout.length > 2) ok('读数文字已更新：' + after5.readout);
  else bad('读数没更新');

  /* 操作提示「请一直点击」：圈满之前不该消失。
     我一度写成"点一下就收掉"，那正好毁掉它的用处 ——
     用户点一下、提示没了，就以为完事了。所以要盯着这条。 */
  const hint = JSON.parse(await evalJs(`(() => {
    const h = document.getElementById('mq-hint');
    return JSON.stringify({
      exists: !!h,
      text: h ? h.textContent.trim() : null,
      done: h ? h.classList.contains('is-done') : null,
      opacity: h ? +(+getComputedStyle(h).opacity).toFixed(2) : null,
    });
  })()`));
  console.log('       操作提示 ' + JSON.stringify(hint));
  if (hint.exists && hint.text && hint.text.indexOf('一直点') >= 0) {
    ok('有「请一直点击」提示：' + hint.text);
  } else {
    bad('缺操作提示：' + JSON.stringify(hint));
  }
  if (hint.done) bad('才点 5 下提示就消失了 —— 那正好毁掉它的用处');
  else ok('还没满圈，提示仍在（这是对的）');
  if (hint.opacity > 0.3) ok('提示可见（opacity=' + hint.opacity + '）');
  else bad('提示看不见：' + hint.opacity);

  // 滚到互动屏再加人，截出来的才是圆圈本身
  await evalJs(`(() => {
    const a = document.getElementById('mq-act');
    window.scrollTo(0, a.offsetTop + a.offsetHeight / 2 - innerHeight / 2);
  })()`);
  await sleep(700);

  const max = base.max;
  await evalJs(`(() => { for (let i = 0; i < ${max}; i++) window.__XM_CIRCLE__.add(); })()`);
  await sleep(900);
  const full = JSON.parse(await evalJs(`(() => {
    const svg = document.querySelector('.mq');
    return JSON.stringify({
      count: window.__XM_CIRCLE__.count,
      people: document.querySelectorAll('.mq__person').length,
      heat: getComputedStyle(svg).getPropertyValue('--mq-heat').trim(),
      zoom: String(window.__XM_CIRCLE__ ? 1 : 0),
      readout: document.getElementById('mq-readout').textContent.trim().slice(0, 24),
    });
  })()`));
  console.log('       ' + JSON.stringify(full));
  if (full.count === max) ok('可以加到满圈（' + max + ' 人）'); else bad('满圈人数 = ' + full.count);
  if (parseFloat(full.heat) > 0.95) ok('满圈时热度拉满'); else bad('满圈热度 = ' + full.heat);

  // 庆祝动画：满圈时冲击波应当真的动起来
  const fx0 = JSON.parse(await evalJs(`(() => {
    const w = document.querySelectorAll('.mq__wave');
    return JSON.stringify({
      waves: w.length,
      sparks: document.querySelectorAll('.mq__spark').length,
      hasFlash: !!document.querySelector('.mq__flash'),
      r: w[0] ? Math.round(Number(w[0].getAttribute('r'))) : -1,
      op: w[0] ? Number(w[0].getAttribute('opacity') || 0) : -1,
    });
  })()`));
  console.log('       庆祝层 ' + JSON.stringify(fx0));
  if (fx0.waves === 3 && fx0.sparks === 36 && fx0.hasFlash) ok('庆祝层已就位（3 环 + 36 光点 + 闪光）');
  else bad('庆祝层不完整：' + JSON.stringify(fx0));

  /* 爆开最亮的那一刻截图（约 0.35s，晚了就散了） */
  await sleep(350);
  const shotBurst = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'mq-burst.png'), Buffer.from(shotBurst.result.data, 'base64'));

  const fx1 = JSON.parse(await evalJs(`(() => {
    const w = document.querySelectorAll('.mq__wave');
    const sp = document.querySelector('.mq__spark');
    const person = document.querySelector('.mq__person');
    return JSON.stringify({
      r: w[0] ? Math.round(Number(w[0].getAttribute('r'))) : -1,
      op: w[0] ? +(Number(w[0].getAttribute('opacity') || 0)).toFixed(3) : -1,
      sparkDist: sp ? Math.round(Math.hypot(Number(sp.getAttribute('cx')) - 280, Number(sp.getAttribute('cy')) - 280)) : -1,
      hop: person ? person.style.getPropertyValue('--hop') : '',
      flashOp: +(Number(document.querySelector('.mq__flash').getAttribute('opacity') || 0)).toFixed(3),
    });
  })()`));
  console.log('       600ms 后 ' + JSON.stringify(fx1));
  if (fx1.r > fx0.r) ok('冲击波在扩散（r ' + fx0.r + ' → ' + fx1.r + '）');
  else bad('冲击波没有扩散：' + JSON.stringify({ fx0, fx1 }));
  if (fx1.sparkDist > 200) ok('光点已飞散到 ' + fx1.sparkDist + 'px');
  else bad('光点没飞出去：' + fx1.sparkDist);
  if (fx1.op > 0.2) ok('冲击波可见（不透明度 ' + fx1.op + '）');
  else bad('冲击波已经看不见了：' + fx1.op);

  // 再等一会儿量人浪（衰减系数 1.1，约 0.6 秒时还在跳）
  await sleep(250);
  const hop = await evalJs(`(() => {
    const ps = [...document.querySelectorAll('.mq__person')];
    const vals = ps.map(p => parseFloat(p.style.getPropertyValue('--hop') || '0'));
    return JSON.stringify({ max: +Math.max(...vals).toFixed(2), moving: vals.filter(v => v > 0.5).length });
  })()`);
  console.log('       人浪 ' + hop);
  const hopObj = JSON.parse(hop);
  if (hopObj.moving > 3) ok('人浪在跳（' + hopObj.moving + ' 个人离地，最高 ' + hopObj.max + 'px）');
  else bad('人浪没动：' + hop);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'mq-full.png'), Buffer.from(shot.result.data, 'base64'));

  // 满圈后再点一次应当重置
  await evalJs(`document.querySelector('.mq__hit').dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
  await sleep(600);
  const afterReset = await evalJs('window.__XM_CIRCLE__.count');
  if (afterReset === 0) ok('满圈后再点一下 → 重置为 0');
  else bad('满圈后点击没有重置，count=' + afterReset);

  // 截图：少量人的状态
  await evalJs(`(() => { for (let i = 0; i < 6; i++) window.__XM_CIRCLE__.add(); })()`);
  await sleep(800);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'mq-few.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('       shots/mq-few.png  shots/mq-full.png');

  const realErrs = logs.filter((l) => !/favicon/i.test(l));
  if (!realErrs.length) ok('无运行时异常');
  else realErrs.slice(0, 4).forEach((l) => bad(l));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 互动自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
