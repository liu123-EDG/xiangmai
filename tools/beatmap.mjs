/* ==========================================================================
   卡点分析
   --------------------------------------------------------------------------
   把 mp3 的鼓点时刻算出来，给视频剪辑用。

   为什么用浏览器解 mp3：机器上没有 ffmpeg，
   而 Chrome 自带解码器（decodeAudioData），拿来就用，还准。

   输出：
     · 时长 / 检出鼓点数 / 平均 BPM
     · 每个鼓点的时刻（秒）
     · 每 1/2/3/4 个鼓点切一刀的粗剪方案

   用法：node tools/beatmap.mjs <音频路径> [--max=15]
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
let cap = 15;
for (const a of args) if (a.startsWith('--max')) cap = parseFloat(a.split('=')[1]);

if (!src || !existsSync(src)) {
  console.log('\n用法：node tools/beatmap.mjs <音频路径> [--max=15]\n');
  process.exit(1);
}

const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.html': 'text/html' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><meta charset="utf-8"><title>beat</title>');
      return;
    }
    const body = await readFile(join(root, p.slice(1)));
    res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const userDir = join(root, '.chrome-beat');
await mkdir(userDir, { recursive: true });
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9741',
  `--user-data-dir=${userDir}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required',
  'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9741/json/list')).json();
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
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(700);

  const rel = src.replace(root, '').replace(/\\/g, '/').replace(/^\//, '');
  const json = await evalJs(`(async () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const buf = await (await fetch('/' + ${JSON.stringify(rel)} + '?t=' + Date.now())).arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);

    const sr = audio.sampleRate;
    const n = audio.length;
    const ch = audio.getChannelData(0);
    const ch2 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;

    /* 谱通量起音包络：比纯能量更能抓密集鼓点。
       分帧 → FFT → 只取正向差分 → 求和。 */
    const HOP = 256, WIN = 1024;
    const frames = Math.max(0, Math.floor((n - WIN) / HOP) + 1);
    const env = new Float32Array(frames);
    const re = new Float32Array(WIN), im = new Float32Array(WIN);
    let prev = null;
    for (let f = 0; f < frames; f++) {
      const off = f * HOP;
      for (let i = 0; i < WIN; i++) {
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1));   // Hann
        const s = (ch[off + i] + (ch2 ? ch2[off + i] : 0)) * 0.5 * w;
        re[i] = s; im[i] = 0;
      }
      // 就地 FFT（radix-2）
      for (let i = 1, j = 0; i < WIN; i++) {
        let bit = WIN >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (let len = 2; len <= WIN; len <<= 1) {
        const ang = -2 * Math.PI / len;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < WIN; i += len) {
          let cr = 1, ci = 0;
          for (let k = 0; k < len / 2; k++) {
            const ur = re[i + k], ui = im[i + k];
            const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
            const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
            re[i + k] = ur + vr; im[i + k] = ui + vi;
            re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
            const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
          }
        }
      }
      const half = WIN >> 1;
      const mag = new Float32Array(half);
      for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
      if (prev) {
        let s = 0;
        for (let i = 0; i < half; i++) { const d = mag[i] - prev[i]; if (d > 0) s += d; }
        env[f] = s;
      }
      prev = mag;
    }

    let mx = 0; for (let i = 0; i < frames; i++) if (env[i] > mx) mx = env[i];
    if (mx > 0) for (let i = 0; i < frames; i++) env[i] /= mx;

    const fps = sr / HOP;
    const minGap = Math.max(1, Math.round(0.10 * fps));
    const TH = 0.13;
    const peaks = [];
    let last = -1e9;
    for (let i = 1; i < frames - 1; i++) {
      if (env[i] < TH) continue;
      if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
      if (i - last < minGap) {
        if (peaks.length && env[i] > env[peaks[peaks.length - 1]]) { peaks[peaks.length - 1] = i; last = i; }
        continue;
      }
      peaks.push(i); last = i;
    }
    const hits = peaks.map((p) => +(p / fps).toFixed(3));
    return JSON.stringify({ duration: +(audio.duration.toFixed(3)), sampleRate: sr, hits });
  })()`);

  const r = JSON.parse(json);
  const hits = r.hits.filter((h) => h <= cap);

  console.log('\n══════════ 卡点分析 ══════════');
  console.log('  文件      ' + basename(src));
  console.log('  时长      ' + r.duration + ' 秒   采样率 ' + r.sampleRate);
  console.log('  检出鼓点  ' + r.hits.length + ' 个（前 ' + cap + ' 秒内 ' + hits.length + ' 个）');

  if (hits.length > 1) {
    const gaps = [];
    for (let i = 1; i < hits.length; i++) gaps.push(hits[i] - hits[i - 1]);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    console.log('  平均间隔  ' + avg.toFixed(3) + ' 秒  →  约 ' + (60 / avg).toFixed(0) + ' BPM');
    console.log('  中位间隔  ' + med.toFixed(3) + ' 秒  →  约 ' + (60 / med).toFixed(0) + ' BPM');
    console.log('  间隔范围  ' + Math.min(...gaps).toFixed(3) + ' – ' + Math.max(...gaps).toFixed(3) + ' 秒');

    console.log('\n  鼓点时刻（秒）：');
    let line = [];
    hits.forEach((h, i) => {
      line.push(i === 0 ? h.toFixed(2) : h.toFixed(2) + '(+' + (h - hits[i - 1]).toFixed(2) + ')');
      if (line.length === 4) { console.log('    ' + line.join('  ')); line = []; }
    });
    if (line.length) console.log('    ' + line.join('  '));

    console.log('\n  粗剪方案：');
    for (const every of [1, 2, 3, 4]) {
      const pts = hits.filter((_, i) => i % every === 0);
      console.log('    每 ' + every + ' 个鼓点一刀 → ' + pts.length + ' 个镜头');
      console.log('      ' + pts.map((p) => p.toFixed(2)).join('  '));
    }
  }

  await mkdir(join(root, '.tmp'), { recursive: true });
  await writeFile(join(root, '.tmp', 'beatmap.json'),
    JSON.stringify({ file: basename(src), duration: r.duration, hits }, null, 2), 'utf8');
  console.log('\n  已写出 .tmp/beatmap.json\n');

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
