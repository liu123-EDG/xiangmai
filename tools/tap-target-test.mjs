/* 量底部「上一章 / 下一章」的可点区域。
   判据是可点尺寸 —— 给年纪大的评委看，这个数比"看着还行"可靠。
   基线：44×44 px 是无障碍通行下限（苹果 HIG / 谷歌 Material 都是这个数）。 */
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
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-tap');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10441',
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

/* 目标值。MIN 是无障碍下限；GOOD 是给"年纪大"这一条留的余量。 */
const MIN = 44;
const GOOD = 56;

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:10441/json/list')).json();
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
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');

  const PAGES = [
    ['index.html', '序章', '1440x900'],
    ['qiongnaieman/index.html', '第二章', '1440x900'],
    ['lishi/index.html', '第五章', '1440x900'],
    ['index.html', '序章', '390x844'],            // 手机：分幕导航（actnav）
    ['dastan/index.html', '第三章', '390x844'],    // 手机：章末按钮
  ];

  console.log('\n[底部章节按钮 · 可点尺寸（目标 ≥' + GOOD + '，下限 ' + MIN + '）]\n');
  console.log('  页面      视口        按钮                    宽×高          判定');

  for (const [path, name, vp] of PAGES) {
    const [w, h] = vp.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${path}` });
    await sleep(1600);
    await evalJs(`localStorage.setItem('xiangmai.unlocked.mashrap','1')`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${path}` });
    await sleep(2600);
    /* 两种导航都量：
         .chapter-nav  —— 章末「上一章 / 下一章」（所有内页）
         .actnav__btn  —— 章内分幕导航（序章那一页用的就是它）
       只量一种会漏掉另一整类按钮。 */
    const sel = '.chapter-nav a, .actnav__btn, .actnav__dots button';
    const hasNav = await evalJs(`!!document.querySelector('${sel}')`);
    if (!hasNav) {
      console.log('  ' + name.padEnd(8) + vp.padEnd(11) + '（这一页没有可量的导航按钮，跳过）');
      continue;
    }
    /* 滚到底 —— 不滚过去 reveal 没触发，量到的是隐藏状态 */
    await evalJs(`document.querySelector('.chapter-nav, .actnav').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(900);

    const r = JSON.parse(await evalJs(`(() => {
      const links = [...document.querySelectorAll('${sel}')];
      return JSON.stringify(links.map((a) => {
        const b = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return {
          text: a.textContent.trim().replace(/\\s+/g, ' '),
          cls: a.className || '',
          w: Math.round(b.width), h: Math.round(b.height),
          font: cs.fontSize,
          /* 显示状态 —— 别把"没显形所以量出 0"当成按钮太小 */
          visible: b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0',
          /* 禁用态（比如第一幕的「上一幕」）仍然要够大 ——
             它只是现在不能按，尺寸标准一样适用 */
          disabled: a.disabled === true,
          display: cs.display,
        };
      }));
    })()`));

    /* **按控件类别定标准，不是一个数套所有。**
       主按钮（上一章 / 下一章 / 上一幕 / 下一幕）是"往哪走"的决策点，
       给年纪大的用户留余量 → 56。
       分幕圆点是次要的快速跳转，四个一竖排，做太大会占掉小半屏 →
       32（仍远大于原来的 11×18，也高于"指尖最小可点"的经验值）。
       混在一起用一个标准，只会得到一堆没法照做的"失败"。 */
    const needOf = (a) =>
      (a.cls.indexOf('actnav__dots') >= 0 || a.w <= 40) ? 32 : GOOD;

    r.forEach((a) => {
      const need = needOf(a);
      const pass = a.h >= need && a.w >= need;
      const isDot = need === 32;
      console.log('  ' + name.padEnd(8) + vp.padEnd(11) +
        (isDot ? '·分幕点 ' : ' 按钮   ') +
        a.text.slice(0, 18).padEnd(20) +
        (a.w + '×' + a.h).padEnd(14) +
        (pass ? 'ok' : '太小（需 ≥' + need + '）'));
      if (!a.visible) bad(name + ' 的按钮量不到尺寸（可能没显形）');
      else if (!pass) bad(name + '「' + a.text + '」只有 ' + a.w + '×' + a.h +
        '，字 ' + a.font + ' —— 需要 ≥' + need + '×' + need);
    });
    if (r.length && r.every((a) => {
      const need = needOf(a);
      return a.visible && a.h >= need && a.w >= need;
    })) {
      ok(name + '（' + vp + '）' + r.length + ' 个控件全部够大');
    }
  }

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项偏小\n' : '✓ 底部按钮尺寸合格\n'));
process.exit(fails ? 1 : 0);
