/* 第二章页面的自检：结构、轮盘、交互、file:// 直开、控制台错误。
   用法：node tools/chapter-test.mjs [页面相对路径] */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = process.argv[2] || 'qiongnaieman/index.html';
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = join(root, p === '/' ? '/index.html' : p);
    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
await mkdir(join(root, 'shots'), { recursive: true });
const dbgPort = 9551;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
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
    if (m.method === 'Log.entryAdded') logs.push('[' + m.params.entry.level + '] ' + m.params.entry.text);
    if (m.method === 'Runtime.exceptionThrown') {
      logs.push('[exception] ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text));
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push('[console.' + m.params.type + '] ' +
        m.params.args.map((a) => a.value !== undefined ? a.value : (a.description || '')).join(' '));
    }
    if (m.method === 'Network.loadingFailed') {
      logs.push('[net] ' + m.params.errorText + ' type=' + m.params.type);
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      logs.push('[net] ' + m.params.response.status + ' ' + m.params.response.url);
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });

  console.log('\n[第二章自检] ' + page);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${page}` });
  await sleep(4200);

  /* 装一个错误收集器再刷新一次：Log/Runtime 域偶尔抓不到脚本加载期的异常，
     而"脚本没执行"这类问题必须看到真实错误才能修。 */
  await evalJs(`(() => {
    window.__ERRS__ = [];
    window.addEventListener('error', (e) => {
      window.__ERRS__.push(String((e.error && e.error.stack) || e.message || e));
    }, true);
    window.addEventListener('unhandledrejection', (e) => {
      window.__ERRS__.push('unhandled: ' + String(e.reason && e.reason.stack || e.reason));
    });
    return 'ok';
  })()`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(4200);
  const pageErrs = await evalJs('JSON.stringify(window.__ERRS__ || [])');
  console.log('       页面内错误 ' + pageErrs);

  // 浏览器实际拿到的是哪一份产物？把关键行取回来看
  const fetched = await evalJs(`(async () => {
    const r = await fetch('../js/dist/qiongnaieman.js?cachebust=' + Date.now());
    const t = await r.text();
    const lines = t.split('\\n');
    return JSON.stringify({
      status: r.status, bytes: t.length,
      line603: lines[602] || '(无)',
      hasNs0: t.indexOf('var __ns0 = {};') >= 0,
      hasCall: t.indexOf('__module0__.call(__ns0)') >= 0,
    });
  })()`);
  console.log('       浏览器取到的产物 ' + fetched);

  // 最直接的一问：启动到底在哪一步失败
  const marker = await evalJs(`JSON.stringify({
    bootErr: window.__XM_BOOT_ERR__ || null,
    dataRender: document.body.dataset.render,
  })`);
  console.log('       启动诊断 ' + marker);
  console.log('       控制台/网络：');
  logs.slice(-14).forEach((l) => console.log('         ' + String(l).slice(0, 200)));

  // 诊断：脚本到底有没有被执行
  const scriptDiag = await evalJs(`(() => {
    const s = document.querySelector('script[src*="dist"]');
    return JSON.stringify({
      found: !!s,
      src: s ? s.getAttribute('src') : null,
      resolved: s ? s.src : null,
      type: s ? (s.type || '(无)') : null,
      defer: s ? s.defer : null,
      marker: typeof window.__XM_SEQ__,
    });
  })()`);
  console.log('       脚本诊断 ' + scriptDiag);

  /* 注意：不要用 new Function(txt)() 去"试跑"产物 ——
     new Function 创建的函数在严格模式下 this 是 undefined，
     而产物里的模块登记依赖 this，那样测会得到假失败。 */

  const info = JSON.parse(await evalJs(`(() => {
    const c = document.getElementById('air');
    return JSON.stringify({
      render: document.body.dataset.render,
      ready: document.body.classList.contains('is-ready'),
      canvasAttr: c ? [c.width, c.height] : null,
      navLinks: document.querySelectorAll('.sitelinks a').length,
      navActive: (document.querySelector('.sitelinks a[aria-current]') || {}).textContent || '',
      acts: document.querySelectorAll('[data-act]').length,
      /* 部件统计。**图位（figure.slot）已经全站删掉了** ——
         那套"图片位 / 图注位"占位在重做里被移除，现在八个页面一个都没有。
         所以这里改成数真正存在的正文部件：
         对照表、字幕块、章节导航。 */
      duos: document.querySelectorAll('.duo').length,
      plates: document.querySelectorAll('.plate-act').length,
      bodies: document.querySelectorAll('.body').length,
      navLinks2: document.querySelectorAll('.chapter-nav a').length,
      wheelNodes: document.querySelectorAll('.wnode').length,
      revealed: document.querySelectorAll('.reveal.is-in').length,
    });
  })()`));

  console.log('       ' + JSON.stringify(info));

  if (info.render === 'chapter' || info.render === 'basic') ok('渲染后端 = ' + info.render);
  else bad('渲染后端异常：' + info.render);
  if (info.ready) ok('入场就绪（is-ready）'); else bad('未进入 is-ready');
  if (info.canvasAttr && info.canvasAttr[0] > 300) ok('空气层画布已按视口建立 ' + info.canvasAttr);
  else bad('空气层画布尺寸异常：' + info.canvasAttr);

  // 导航：已做的章节是真链接，未做的呈现为"待补"而不是死链
  const navState = JSON.parse(await evalJs(`(() => {
    const links = document.querySelectorAll('.sitelinks a');
    const todos = document.querySelectorAll('.sitelinks__todo');
    const active = document.querySelector('.sitelinks a[aria-current]');
    return JSON.stringify({
      links: links.length,
      todos: todos.length,
      active: active ? active.textContent : '',
      total: document.querySelectorAll('.sitelinks li').length,
    });
  })()`));
  console.log('       导航 ' + JSON.stringify(navState));
  if (navState.total >= 4 && navState.links + navState.todos === navState.total) {
    ok('导航渲染完整：' + navState.links + ' 个链接 + ' + navState.todos + ' 个待补');
  } else {
    bad('导航结构异常：' + JSON.stringify(navState));
  }
  if (navState.active.indexOf('穹乃额曼') >= 0) ok('当前页在导航里高亮：' + navState.active);
  else bad('导航未高亮当前页，实际为「' + navState.active + '」');

  // 结构
  if (info.acts >= 7) ok('幕数 = ' + info.acts); else bad('幕数偏少：' + info.acts);
  /* 正文部件（原来查 figure.slot，那套图位已全站删除）。
     改查真正存在的：正文段 + 章节导航 + 字幕块。
     判据放宽到"有正文且导航在"，因为各章的正文形式不一样。 */
  const partTotal = info.duos + info.plates + info.bodies;
  if (partTotal >= 5) ok('正文部件 = ' + partTotal +
    '（正文段 ' + info.bodies + ' · 字幕块 ' + info.plates + ' · 对照表 ' + info.duos + '）');
  else bad('正文部件偏少：' + partTotal);
  if (info.navLinks2 >= 1 || info.navLinks >= 1) {
    ok('章节导航在（导航链接 ' + Math.max(info.navLinks, info.navLinks2) + ' 个）');
  } else bad('找不到章节导航');
  if (info.revealed > 0) ok('滚动显形已生效（' + info.revealed + ' 个元素入场）');
  else bad('没有任何元素进入 is-in');

  /* 轮盘 / 读数。
     **轮盘只存在于附录（fulu）**，第二、三、四章都没有。
     原来这里无条件查第二幕的 .wnode 并取 [2] —— 取到 undefined
     再 .dispatchEvent 就抛 "Uncaught"，整个自检中断在半路，
     后面全都没跑（踩过）。所以这类"某页才有的部件"必须先判断在不在。 */
  if (info.wheelNodes > 0) {
    if (info.wheelNodes === 12) ok('十二木卡姆轮盘：12 个节点');
    else bad('轮盘节点数 = ' + info.wheelNodes + '，应为 12');

    const hover = await evalJs(`(() => {
      const nodes = document.querySelectorAll('.wnode');
      if (nodes.length < 3) return '';
      nodes[2].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const r = document.getElementById('wheel-readout');
      return r ? r.textContent.trim().slice(0, 60) : '';
    })()`);
    if (hover && hover.indexOf('木夏吾莱克') >= 0) ok('悬停第三个节点，读数已更新：' + hover);
    else bad('轮盘读数未按悬停更新，实际为：' + hover);
  } else {
    ok('这一页没有轮盘（轮盘在附录），跳过轮盘检查');
  }

  /* ---- 以下都是**轮盘 / 旋律专有**的检查，只有附录有这两个部件 ----
     整段包在 hasParts 里。原来没有守卫：第二章上取 .wnode[0] 得到 undefined，
     读 .tagName 就抛 "Uncaught"，自检从中间断掉，后面全没跑（踩过）。 */
  const hasParts = info.wheelNodes > 0;
  if (hasParts) {
    // 节点应当是真正的链接（可 Tab、可新标签打开）
    const linkInfo = JSON.parse(await evalJs(`(() => {
      const n = document.querySelectorAll('.wnode')[0];
      if (!n) return JSON.stringify({});
      return JSON.stringify({
        tag: n.tagName,
        ns: n.namespaceURI,
        hrefAttr: n.getAttribute('href'),
        isLink: n instanceof SVGAElement || n.tagName.toLowerCase() === 'a',
        tabbable: n.hasAttribute('tabindex') || n.tagName.toLowerCase() === 'a',
      });
    })()`));
    console.log('       节点链接信息 ' + JSON.stringify(linkInfo));
    if (linkInfo.isLink && linkInfo.hrefAttr) ok('节点是真正的链接（可键盘、可新标签打开）');
    else bad('节点不是链接，键盘与语义会退化：' + JSON.stringify(linkInfo));

    // 滚动到轮盘正中，让它完整进入视口
    await evalJs(`(() => {
      const w = document.getElementById('wheel-act');
      if (w) window.scrollTo(0, w.offsetTop + w.offsetHeight / 2 - innerHeight / 2);
    })()`);
    await sleep(1600);
    const wheelState = JSON.parse(await evalJs(`(() => {
      const svg = document.querySelector('.wheel');
      if (!svg) return JSON.stringify({});
      const r = svg.getBoundingClientRect();
      const rotor = document.querySelector('.wheel__rotor');
      return JSON.stringify({
        visible: r.top < innerHeight && r.bottom > 0,
        focusVar: getComputedStyle(svg).getPropertyValue('--wheel-focus').trim(),
        transform: rotor ? rotor.style.transform : '',
      });
    })()`));
    console.log('       ' + JSON.stringify(wheelState));
    if (wheelState.visible) ok('滚动后轮盘进入视口');
    else bad('轮盘未进入视口');
    if (wheelState.transform) ok('轮盘随滚动转动：' + wheelState.transform);
    else bad('轮盘未随滚动转动（transform 为空）');

    // 轮盘截图（放在这里，因为它刚滚过去）
    const shotWheel = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', 'chapter-wheel.png'), Buffer.from(shotWheel.result.data, 'base64'));
  }

  // 旋律入口图
  const mel = JSON.parse(await evalJs(`(() => {
    const notes = document.querySelectorAll('.mnote');
    const first = notes[0];
    return JSON.stringify({
      count: notes.length,
      staffLines: document.querySelectorAll('.melody__line').length,
      hasClef: !!document.querySelector('.melody__clef'),
      curveLen: (document.querySelector('.melody__curve') || {}).getTotalLength
        ? Math.round(document.querySelector('.melody__curve').getTotalLength()) : 0,
      firstTag: first ? first.tagName : null,
      firstHref: first ? first.getAttribute('href') : null,
    });
  })()`));
  console.log('       旋律图 ' + JSON.stringify(mel));
  if (mel.count === 0) {
    /* 这一页没有旋律入口（它也在附录）。
       **不能无条件取 notes[1] 再 dispatchEvent** —— 取到 undefined 会抛
       "Uncaught"，把整个自检中断在半路（和上面轮盘那个坑一样）。 */
    ok('这一页没有旋律入口（它在附录），跳过旋律检查');
  } else {
    if (mel.count === 8) ok('旋律入口：8 个音符');
    else bad('音符数 = ' + mel.count + '，应为 8');
    if (mel.staffLines === 5 && mel.hasClef) ok('五线谱与谱号已绘制');
    else bad('谱表不完整：线=' + mel.staffLines + ' 谱号=' + mel.hasClef);
    if (mel.curveLen > 400) ok('旋律曲线长度 ' + mel.curveLen + '（可被"吹奏"出来）');
    else bad('旋律曲线异常，长度 ' + mel.curveLen);
    if (mel.firstHref) ok('音符是真链接：' + mel.firstHref);
    else bad('音符不是链接：' + mel.firstHref);

    const melHover = await evalJs(`(() => {
      const nodes = document.querySelectorAll('.mnote');
      if (nodes.length < 2) return '';
      nodes[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const r = document.getElementById('melody-readout');
      return r ? r.textContent.trim().slice(0, 48) : '';
    })()`);
    if (melHover && melHover.indexOf('马头琴') >= 0) ok('悬停第二个音符，读数已更新：' + melHover);
    else bad('旋律读数未按悬停更新，实际为：' + melHover);
  }

  // 滚动后旋律线应当被画出一部分（同样只有附录有）
  if (mel.count > 0) {
    await evalJs(`(() => {
      const w = document.getElementById('melody-act');
      if (w) window.scrollTo(0, w.offsetTop + w.offsetHeight / 2 - innerHeight / 2);
    })()`);
    await sleep(1500);
    const played = await evalJs(`(() => {
      const c = document.querySelector('.melody__curve');
      return c ? c.style.strokeDashoffset : '';
    })()`);
    console.log('       旋律播放进度（dashoffset）=' + played);
    if (played && parseFloat(played) >= 0) ok('旋律随滚动被"吹奏"出来');
    else bad('旋律未随滚动推进：' + played);

    const shot3 = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(root, 'shots', 'chapter-melody.png'), Buffer.from(shot3.result.data, 'base64'));
    console.log('       shots/chapter-melody.png');
  }

  await evalJs('window.scrollTo(0,0)');
  await sleep(1400);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(root, 'shots', 'chapter-top.png'), Buffer.from(shot2.result.data, 'base64'));
  console.log('       shots/chapter-top.png  shots/chapter-wheel.png  shots/chapter-melody.png');

  // file:// 直开
  await send('Page.navigate', { url: 'file:///' + join(root, page).replace(/\\/g, '/') });
  await sleep(4200);
  const fileState = JSON.parse(await evalJs(`(() => {
    const c = document.getElementById('air');
    return JSON.stringify({
      render: document.body.dataset.render,
      ready: document.body.classList.contains('is-ready'),
      canvasAttr: c ? [c.width, c.height] : null,
      wheel: document.querySelectorAll('.wnode').length,
    });
  })()`));
  console.log('       file:// ' + JSON.stringify(fileState));
  if (fileState.ready && fileState.canvasAttr && fileState.canvasAttr[0] > 300) ok('file:// 下正常执行');
  else bad('file:// 下脚本未执行完：' + JSON.stringify(fileState));
  /* 轮盘只在附录。第二章 file:// 下不该有它 ——
     该查的是"双击打开时脚本照样跑起来"，那由上面那条保证。 */
  if (hasParts) {
    if (fileState.wheel === 12) ok('file:// 下轮盘也生成了');
    else bad('file:// 下轮盘节点数 = ' + fileState.wheel);
  } else {
    ok('这一页本来就没有轮盘（file:// 下不该有），跳过');
  }

  /* 资源 404。
     这一段原来是"缺图 → 槽位退回占位"的判定，但**图位已经全站删掉**了，
     所以现在只分两种情况：有 404 就是真问题（页面不再有任何预期内的缺图）。 */
  const img404 = logs.filter((l) => /assets\//.test(l) && /404/.test(l)).length;
  const genericRes404 = logs.filter((l) => /Failed to load resource/.test(l)).length;
  console.log('       资源 404：带路径 ' + img404 + ' 条，通用提示 ' + genericRes404 + ' 条');
  if (img404 === 0 && genericRes404 === 0) {
    ok('无资源 404（图位已删，不再有预期内的缺图）');
  } else {
    bad('有资源 404：带路径 ' + img404 + ' 条，通用 ' + genericRes404 + ' 条');
  }

  const real = logs.filter((l) =>
    !/favicon/i.test(l) &&
    !/assets\/img\//.test(l) &&
    !/Failed to load resource/.test(l) &&
    !/ERR_FILE_NOT_FOUND/.test(l));      // file:// 下缺图的表现同样是设计内的
  if (real.length === 0) ok('无其他控制台错误');
  else real.slice(0, 6).forEach((l) => bad(String(l).slice(0, 180)));

  ws.close();
} catch (e) { bad('自检中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 第二章自检全部通过') + '\n');
process.exit(fails ? 1 : 0);
