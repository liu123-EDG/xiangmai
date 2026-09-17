/* ==========================================================================
   移动端自检
   --------------------------------------------------------------------------
   在真实手机尺寸与 DPR 下开每一页，量这些东西：
     · 渲染后端与画布尺寸（移动 GPU 上 WebGL 可能直接失败）
     · 帧率（首屏与章节页的地火都很吃填充率）
     · 首屏可滚动长度与每次手势能推进多少（滚轮驱动在触屏上语义不同）
     · 触控命中区大小（小到点不到就是废的）
     · 横向溢出、内容宽度、字号是否小到读不了
   用法：node tools/mobile-test.mjs
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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
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
const dbgPort = 9611;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 设备档位。iPhone 12 与一台中低端安卓 */
const DEVICES = [
  { name: 'iPhone 12', w: 390, h: 844, dpr: 3, mobile: true },
  { name: '安卓中端',  w: 412, h: 915, dpr: 2.625, mobile: true },
];

const PAGES = [
  'index.html',
  'qiongnaieman/index.html',
  'lishi/index.html',
  'fulu/index.html',
];

let fails = 0;
const ok = (m) => console.log('    ok   ' + m);
const bad = (m) => { fails++; console.log('    FAIL ' + m); };
const warn = (m) => console.log('    !!   ' + m);

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

  console.log('\n[移动端自检]');

  for (const D of DEVICES) {
    console.log('\n── ' + D.name + '  ' + D.w + '×' + D.h + ' @' + D.dpr + 'x ──');
    await send('Emulation.setDeviceMetricsOverride', {
      width: D.w, height: D.h, deviceScaleFactor: D.dpr, mobile: D.mobile,
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    for (const page of PAGES) {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}` });
      await sleep(4200);

      const s = JSON.parse(await evalJs(`(() => {
        const cv = document.querySelector('canvas');
        const cr = cv ? cv.getBoundingClientRect() : null;
        const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;

        /* 触控命中区：所有可点元素的尺寸，找出小于 40px 的 */
        const small = [];
        document.querySelectorAll('a, button').forEach(el => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width === 0 || r.height === 0 || cs.display === 'none' || cs.visibility === 'hidden') return;
          if (r.bottom < 0 || r.top > innerHeight * 6) return;      // 只看前几屏
          if (Math.min(r.width, r.height) < 40) {
            small.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 14),
                         w: Math.round(r.width), h: Math.round(r.height) });
          }
        });

        /* 正文字号 */
        const bodyText = document.querySelector('.body, .chapter-hero__lead, .guide__line');
        const fs = bodyText ? parseFloat(getComputedStyle(bodyText).fontSize) : null;

        return JSON.stringify({
          render: document.body.dataset.render,
          bootErr: window.__XM_BOOT_ERR__ || null,
          ready: document.body.classList.contains('is-ready'),
          canvasCSS: cr ? [Math.round(cr.width), Math.round(cr.height)] : null,
          canvasBuf: cv ? [cv.width, cv.height] : null,
          bufferPixels: cv ? cv.width * cv.height : 0,
          innerW: window.innerWidth, innerH: window.innerHeight,
          bodyH: document.body.scrollHeight,
          overflow,
          smallTargets: small.slice(0, 6),
          smallCount: small.length,
          fontSize: fs,
          navVisible: [...document.querySelectorAll('.sitelinks a')].filter(a => a.getBoundingClientRect().width > 0).length,
        });
      })()`));

      console.log('\n  ' + page);
      if (s.bootErr) bad('启动错误：' + JSON.stringify(s.bootErr).slice(0, 140));
      if (s.render === 'pending') bad('脚本没跑完');
      else ok('后端=' + s.render + '  画布 CSS=' + s.canvasCSS + '  缓冲=' + s.canvasBuf +
              ' (' + (s.bufferPixels / 1e6).toFixed(2) + 'M px)');

      // 缓冲像素预算：手机上超过 ~4M 就要担心填充率
      if (s.bufferPixels > 8e6) bad('后备缓冲 ' + (s.bufferPixels / 1e6).toFixed(1) + 'M 像素，手机上填充率压力过大');
      else if (s.bufferPixels > 4e6) warn('后备缓冲 ' + (s.bufferPixels / 1e6).toFixed(1) + 'M 像素，偏大');
      else ok('后备缓冲在预算内');

      if (s.overflow) bad('出现横向溢出，页面会被拖动');
      else ok('无横向溢出');

      if (s.navVisible >= 5) ok('导航可见 ' + s.navVisible + ' 格');
      else bad('导航只剩 ' + s.navVisible + ' 格');

      if (s.fontSize && s.fontSize < 13) bad('正文字号 ' + s.fontSize + 'px，手机上偏小');
      else if (s.fontSize) ok('正文字号 ' + s.fontSize + 'px');

      if (s.smallCount === 0) ok('触控命中区均 ≥40px');
      else warn(s.smallCount + ' 个命中区小于 40px：' +
        s.smallTargets.map((t) => t.t + '(' + t.w + '×' + t.h + ')').join(' '));

      // 帧率：跑 2 秒数 rAF
      const fps = await evalJs(`new Promise(res => {
        let n = 0; const t0 = performance.now();
        (function tick() {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
          else res(Math.round(n / ((performance.now() - t0) / 1000)));
        })();
      })`);
      if (fps >= 40) ok('fps ≈ ' + fps);
      else if (fps >= 24) warn('fps ≈ ' + fps + '，偏低');
      else bad('fps ≈ ' + fps + '，手机上会卡');

      // 触屏滚动：模拟一次滑动，看页面是否真的滚了
      const scrolled = await evalJs(`(async () => {
        const before = window.scrollY;
        const hero = document.getElementById('hero') || document.querySelector('.chapter-hero');
        window.scrollTo(0, (hero ? hero.offsetHeight : 600));
        await new Promise(r => setTimeout(r, 900));
        return JSON.stringify({ before, after: window.scrollY });
      })()`);
      const sc = JSON.parse(scrolled);
      if (sc.after > sc.before) ok('可滚动 ' + sc.before + ' → ' + sc.after);
      else bad('滚动无效：' + scrolled);
    }
  }

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 移动端自检通过') + '\n');
process.exit(fails ? 1 : 0);
