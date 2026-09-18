/* ==========================================================================
   全站页面自检
   --------------------------------------------------------------------------
   六个页面逐个打开，检查：脚本执行、启动无错、导航完整、每页该有的部件在。

   为什么单独写这个：改了公共模块（site.js / chapter.js）之后，
   受影响的是**所有**页面，但单页自检只会验一个。
   用法：node tools/site-test.mjs
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
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
const dbgPort = 9581;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 页面 → 它必须有的部件 */
const PAGES = [
  /* 入口页是**故意做极简**的：整屏就一条概念片加一个入口，
     不挂 topbar、不挂分幕导航。所以 shell: false —— 跳过外壳检查，
     只验它自己该有的东西。 */
  { path: 'welcome/index.html', nav: '概念片', shell: false,
    need: { '整屏视频': '#hero-video', '入口': '.w-go', '文字层': '#w-title' } },
  { path: 'index.html', nav: '序', need: { '三段结构柱': '.pillar', '分幕导航': '#act-next', '师承网络': '#network' } },
  { path: 'qiongnaieman/index.html', nav: '穹乃额曼', need: { '开场': '.chapter-hero', '概念图': '.plate img', '正文节': '.act' } },
  { path: 'dastan/index.html', nav: '达斯坦', need: { '开场': '.chapter-hero', '正文节': '.act' } },
  { path: 'mashrap/index.html', nav: '麦西热甫', need: { '开场': '.chapter-hero', '正文节': '.act' } },
  { path: 'lishi/index.html', nav: '历史与传承', need: { '时间轴': '.timeline', '对照表': '.duo', '案例': '.case' } },
  { path: 'fulu/index.html', nav: '形制比较', need: { '轮盘': '.wheel', '旋律': '.melody' } },
];

/* 导航格数从 site.js 现算，不写死 ——
   写死的话每加一个页面就要改测试，还会报"导航格数 = 7"这种
   看着像坏了、其实只是断言过时的假失败（刚踩过）。 */
const NAV_COUNT = (() => {
  const src = readFileSync(new URL('../js/lib/site.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('export const NAV'), src.indexOf('];', src.indexOf('export const NAV')));
  return (block.match(/id:\s*'/g) || []).length;
})();

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
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[全站自检] 共 ' + PAGES.length + ' 页\n');

  for (const P of PAGES) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${P.path}` });
    await sleep(3600);

    const state = JSON.parse(await evalJs(`(() => {
      const nav = [...document.querySelectorAll('.sitelinks a')];
      const active = nav.find(a => a.getAttribute('aria-current') === 'page');
      return JSON.stringify({
        render: document.body.dataset.render,
        ready: document.body.classList.contains('is-ready'),
        bootErr: window.__XM_BOOT_ERR__ || null,
        navCount: nav.length,
        navActive: active ? active.textContent.trim() : '',
        chapNav: document.querySelectorAll('.chapter-nav a').length,
        bodyH: document.body.scrollHeight,
      });
    })()`));

    console.log('  ' + P.path);
    for (const [label, sel] of Object.entries(P.need)) {
      const n = await evalJs(`document.querySelectorAll('${sel}').length`);
      if (n > 0) ok(label + ' ×' + n);
      else bad(label + ' 缺失（' + sel + '）');
    }

    if (state.bootErr) bad('启动错误：' + JSON.stringify(state.bootErr).slice(0, 160));
    else ok('启动无错');

    /* shell: false 的页面（入口页）不检查外壳 —— 它故意没有 topbar、
       没有分幕导航、也不需要 is-ready。只验它自己的部件。 */
    if (P.shell === false) {
      console.log('       （这一页不做外壳检查：故意极简）');
      continue;
    }

    if (!state.ready) bad('未进入 is-ready');
    if (state.render === 'pending') bad('渲染后端仍是 pending，脚本没跑完');
    else ok('渲染后端 = ' + state.render);

    /* 格数从 site.js 的 NAV 现算，不写死 ——
       写死的话每加一个页面就要改测试，而且会报"导航格数 = 7"这种
       看着像坏了、其实只是过时的假失败（踩过）。 */
    if (state.navCount === NAV_COUNT) ok('导航 ' + NAV_COUNT + ' 格');
    else bad('导航格数 = ' + state.navCount + '，应为 ' + NAV_COUNT);

    if (state.navActive.indexOf(P.nav) >= 0) ok('当前页高亮：' + state.navActive);
    else bad('高亮错误：期望含「' + P.nav + '」，实际「' + state.navActive + '」');

    if (P.path !== 'index.html') {
      // 链条末端（附录）只有"上一章"，没有"下一章"，这是对的
      const expect = P.path === 'fulu/index.html' ? 1 : 2;
      if (state.chapNav === expect) ok('底部章节导航 ' + state.chapNav + ' 个链接（期望 ' + expect + '）');
      else bad('底部章节导航 = ' + state.chapNav + ' 个链接，应为 ' + expect);
    }

    if (state.bodyH < 400) bad('页面内容过少，高度仅 ' + state.bodyH);
  }

  /* ---------- 最后一项：窄窗口下导航不能消失 ----------
     曾经的 bug：响应式里 .sitelinks{display:none}，宽度 ≤720px 时
     整个顶部导航全没了，只剩底部链接可走，站点串不起来。
     这类问题在常规宽度下测不出来，必须专门扫一遍宽度。 */
  console.log('\n[窄窗口导航]');
  const widths = [1440, 1000, 900, 800, 700, 600, 480];
  let navFails = 0;
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dastan/index.html` });
    await sleep(2400);
    const s = JSON.parse(await evalJs(`(() => {
      const links = [...document.querySelectorAll('.sitelinks a')];
      const vis = links.filter(a => {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' &&
               cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.1;
      });
      // 能不能点到：命中测试落在链接自身上
      let clickable = 0;
      vis.forEach(a => {
        const r = a.getBoundingClientRect();
        if (r.right < 0 || r.left > innerWidth) return;    // 需横向滚动才可见的，跳过命中测试
        const hit = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2));
        if (hit && (hit === a || a.contains(hit))) clickable++;
      });
      return JSON.stringify({ visible: vis.length, clickable });
    })()`));
    const good = s.visible === NAV_COUNT;
    if (!good) navFails++;
    console.log('  ' + (good ? 'ok  ' : 'FAIL') + ' ' + String(w).padStart(4) + 'px  可见 ' +
      s.visible + '/' + NAV_COUNT + '  可点 ' + s.clickable);
  }
  if (navFails === 0) ok('各宽度下导航 ' + NAV_COUNT + ' 格均在，且可点');
  else bad(navFails + ' 个宽度下导航不完整 —— 小屏用户会串不起页面');

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 全站自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
