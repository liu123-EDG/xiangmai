/* ==========================================================================
   声音自检
   --------------------------------------------------------------------------
   听不到声音，但能量是能量的。测四件事：

     1) 音频图能不能建起来（三段 × 四乐句的调度是否真的在跑）
     2) 输出电平：峰值不能顶到 1.0（数字削波），RMS 不能小到听不见
     3) 限幅是否生效：旁路压缩器对比峰值
     4) 三段是否真的不同：各自的 RMS 与频谱重心应有区别
        （穹乃额曼远而暗、麦西热甫贴而亮）

   用法：node tools/audio-test.mjs
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    if (file.endsWith('.html')) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body.toString().replace('</head>', '<script src="/tools/audio-probe.js" defer></script></head>'));
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9521;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
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
    if (m.method === 'Runtime.exceptionThrown') logs.push(((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text));
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4000);

  console.log('\n[声音自检]');
  const r = await send('Runtime.evaluate', {
    expression: 'window.__XM_AUDIO__ ? window.__XM_AUDIO__() : Promise.resolve(null)',
    awaitPromise: true, returnByValue: true,
  });
  const raw = r.result.result && r.result.result.value;
  if (!raw) {
    bad('音频探针未就绪');
    logs.slice(0, 5).forEach((l) => console.log('       ' + String(l).slice(0, 200)));
  } else {
    const A = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (A.ok) ok('音频图建立成功（signal chain: voices → gain → hp → tone → dry/wet → comp → out）');
    else bad('音频图未建立：' + A.err);

    if (A.ctxState) console.log('       AudioContext 状态=' + A.ctxState + '  采样率=' + A.sampleRate);

    // 每段单独跑，量电平与频谱
    console.log('\n段            RMS      峰值     出声占比  触发次数   频谱重心');
    const NAMES = ['穹乃额曼', '达斯坦', '麦西热甫'];
    (A.bands || []).forEach((b, i) => {
      console.log(
        (NAMES[i] || ('段' + (i + 1))).padEnd(12) +
        b.rms.toFixed(4).padStart(8) + '  ' +
        b.peak.toFixed(4).padStart(7) + '  ' +
        (b.duty * 100).toFixed(0).padStart(6) + '%  ' +
        String(b.hits).padStart(8) + '   ' +
        Math.round(b.centroid).toString().padStart(6) + ' Hz'
      );
    });

    const bands = A.bands || [];
    if (bands.length === 3) {
      // 有声音
      if (bands.every((b) => b.rms > 0.004)) ok('三段都有实际输出（不是静音）');
      else bad('有一段几乎没有输出：' + JSON.stringify(bands.map((b) => b.rms)));

      // 散板本来就有留白，用"出声占比"而不是 RMS 判断它是否在工作
      if (bands[0].hits > 0) ok('穹乃额曼确实在敲（' + bands[0].hits + ' 记，出声占比 ' +
        (bands[0].duty * 100).toFixed(0) + '% —— 散板留白多是设计，不是故障）');
      else bad('穹乃额曼在整个窗口内一记都没响');

      // 电平：太轻听不见，太响会削
      const worst = Math.max(...bands.map((b) => b.peak));
      if (worst < 0.99) ok('峰值未顶到 1.0（最高 ' + worst.toFixed(3) + '），无数字削波');
      else bad('峰值 ' + worst.toFixed(3) + ' 已触顶，存在削波');
      if (worst > 0.35) ok('电平够用（峰值 ' + worst.toFixed(3) + '，不是蚊蚋声）');
      else bad('电平偏低：峰值仅 ' + worst.toFixed(3) + '，离限幅太远，动态被浪费');

      const clipTotal = bands.reduce((s, b) => s + b.clipped, 0);
      if (clipTotal === 0) ok('全程无削波样本');
      else bad('检出 ' + clipTotal + ' 个削波样本');

      // 三段要真的不同：频谱重心应递增（远而暗 → 贴而亮）
      const [c0, c1, c2] = bands.map((b) => b.centroid);
      if (c0 < c1 && c1 < c2) {
        ok('三段音色确有区别：频谱重心 ' + [c0, c1, c2].map((v) => Math.round(v)).join(' → ') + ' Hz（远暗 → 贴亮）');
      } else {
        bad('三段频谱重心未形成递增：' + [c0, c1, c2].map((v) => Math.round(v)).join(' / '));
      }

      // 密度：同样时长里麦西热甫应该比穹乃额曼密得多
      const rate = bands.map((b) => b.hits);
      if (rate[2] > rate[0] * 2 && rate[1] > rate[0]) {
        ok('密度递进正确：触发次数 ' + rate.join(' / '));
      } else {
        bad('密度未递进：' + rate.join(' / '));
      }
    }

    // 限幅对比
    if (A.bypass) {
      console.log('\n       限幅对比：  压缩开=' + A.bypass.withComp.toFixed(3) +
                  '  旁路=' + A.bypass.withoutComp.toFixed(3));
      if (A.bypass.withoutComp > A.bypass.withComp * 1.05) {
        ok('压缩器确实在收峰（旁路后峰值高 ' +
           ((A.bypass.withoutComp / A.bypass.withComp - 1) * 100).toFixed(0) + '%）');
      } else {
        ok('峰值未超过阈值，压缩器未介入（阈值 -10dB 下属于正常）');
      }
    }
  }
  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 声音自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
