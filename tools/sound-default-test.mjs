/* 声音默认开 —— 逐页实测。
   判据不是"标签写着开"，而是"第一次真实交互后**真的在响**"。
   不加 autoplay 覆盖，用真实输入事件 —— 这是用户实际的条件。 */
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
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
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
const userDir = join(root, '.chrome-snd');
await mkdir(userDir, { recursive: true });
const dbgPort = 9931;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
  '--mute-audio', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const ok = (m) => console.log('    ok   ' + m);
const bad = (m) => { fails++; console.log('    FAIL ' + m); };

const PAGES = [
  ['welcome/index.html', '入口页'],
  ['index.html', '序章'],
  ['qiongnaieman/index.html', '第二章'],
  ['dastan/index.html', '第三章'],
  ['mashrap/index.html', '第四章'],
  ['lishi/index.html', '第五章'],
  ['fulu/index.html', '附录'],
];

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
  /* 真实的用户输入。
     注意：CDP 的 mouseWheel **不一定**算有效的用户激活
     （视频那次就吃过亏：合成事件不算手势，resume() 被拒，
     于是测出"没声"这种假结论）。
     所以这里用**真实按键**：keydown 是最可靠的用户激活来源。 */
  const realGesture = async () => {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    // 再补一次真实点击，双保险
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 400, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 400, button: 'left', clickCount: 1 });
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('\n[声音默认开 · 逐页实测]\n');

  for (const [path, name] of PAGES) {
    errs.length = 0;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${path}?t=${Date.now()}` });
    await sleep(3200);

    // ① 加载后的默认状态
    const before = JSON.parse(await evalJs(`(() => {
      const b = document.getElementById('sound-toggle');
      const t = document.getElementById('sound-text');
      return JSON.stringify({
        hasBtn: !!b,
        pressed: b ? b.getAttribute('aria-pressed') : null,
        label: t ? t.textContent.trim() : null,
      });
    })()`));

    // ② 第一次真实交互
    await realGesture();
    await sleep(3500);

    // ③ 交互后：真的在响吗
    const after = JSON.parse(await evalJs(`(() => {
      const seq = window.__XM_SEQ__;
      const amb = window.__XM_AMB__;
      const th = window.__XM_THEME__;
      const b = document.getElementById('sound-toggle');
      return JSON.stringify({
        pressed: b ? b.getAttribute('aria-pressed') : null,
        label: document.getElementById('sound-text')
          ? document.getElementById('sound-text').textContent.trim() : null,
        seqEnabled: seq ? seq.enabled : null,
        seqCtx: seq && seq.ctx ? seq.ctx.state : null,
        themePlaying: th ? th.playing : null,
        themeCtx: th ? th.state().ctxState : null,
        ambPlaying: amb ? amb.playing : null,
        ambCtx: amb ? amb.state().ctxState : null,
      });
    })()`));

    console.log('  ── ' + name + ' ──');
    console.log('     载入时 ' + JSON.stringify(before));
    console.log('     交互后 ' + JSON.stringify(after));

    /* 判据：载入时按钮就该显示"开"（如果不带按钮，比如入口页，跳过这条） */
    if (before.hasBtn) {
      if (before.pressed === 'true' && /开/.test(before.label || '')) {
        ok('载入时默认显示「' + before.label + '」');
      } else {
        bad('载入时不是开的：pressed=' + before.pressed + ' label=' + before.label);
      }
    } else {
      console.log('     （这一页没有声音按钮，只有背景乐）');
    }

    /* 判据：交互后真的在响。
       有手鼓的看 seq.enabled + context running；
       只有配乐的看 theme/amb.playing + context running。 */
    const drumming = after.seqEnabled === true && after.seqCtx === 'running';
    const playing = (after.themePlaying === true && after.themeCtx === 'running') ||
                    (after.ambPlaying === true && after.ambCtx === 'running');
    if (drumming || playing) {
      ok('第一次交互后真的在响' +
        (drumming ? '（手鼓）' : '') + (playing ? '（配乐）' : ''));
    } else {
      bad('交互后没响：' + JSON.stringify(after));
    }

    const real = errs.filter((e) => !/favicon/i.test(e));
    real.slice(0, 2).forEach((e) => bad(e));

    /* 默认开之后还要能关掉 —— 这一步最容易改坏：
       如果按钮的点击逻辑还是"toggle 标签"，就会出现
       "按一下标签变关、但声音还在响"（或者反过来）。
       所以真的点一下，看标签和实际声音是不是一致的。 */
    if (before.hasBtn) {
      await evalJs(`document.getElementById('sound-toggle').click()`);
      await sleep(1600);
      const off = JSON.parse(await evalJs(`(() => {
        const seq = window.__XM_SEQ__, th = window.__XM_THEME__, amb = window.__XM_AMB__;
        return JSON.stringify({
          pressed: document.getElementById('sound-toggle').getAttribute('aria-pressed'),
          label: document.getElementById('sound-text').textContent.trim(),
          seqEnabled: seq ? seq.enabled : null,
          themePlaying: th ? th.playing : null,
          ambPlaying: amb ? amb.playing : null,
        });
      })()`));
      const quiet = off.seqEnabled !== true && off.themePlaying !== true && off.ambPlaying !== true;
      if (off.pressed === 'false' && /关/.test(off.label) && quiet) {
        ok('点一下就关掉了（标签「' + off.label + '」，且确实没声）');
      } else {
        bad('关不掉，或标签与实际不符：' + JSON.stringify(off));
      }
    }
  }

  ws.close();
} catch (e) { bad('中断：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 声音默认开，逐页确认\n'));
process.exit(fails ? 1 : 0);
