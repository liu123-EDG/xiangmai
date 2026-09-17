/* 量麦西热甫纹样：把画布读回来，算亮度与"有没有结构"。 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const body = await readFile(join(root, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'content-type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const userDir = join(root, '.chrome-profile');
await mkdir(userDir, { recursive: true });
const dbgPort = 9661;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${userDir}`, '--no-first-run', '--enable-unsafe-swiftshader',
  '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/mashrap/index.html` });
  await sleep(4200);

  /* 单独把纹样程序渲进离屏目标再读 —— 绕开合成层，
     这样量到的就是纹样本身，不会和暗角/浮尘混在一起。 */
  const probe = await evalJs(`(() => {
    const rd = window.__XM_RENDERER__;
    if (!rd) return JSON.stringify({ err: 'renderer 没暴露' });
    const gl = rd.gl;
    const out = { hasProgram: !!rd.pMashraq, mode: rd.mode };

    for (const heat of [0, 0.5, 1]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rd.rt.fb);
      gl.viewport(0, 0, rd.size[0], rd.size[1]);
      gl.disable(gl.BLEND);
      gl.useProgram(rd.pMashraq);
      rd._bindQuad(rd.pMashraq);
      const u = rd.uMashraq.u;
      gl.uniform1f(u.u_time, 1.0);
      gl.uniform2f(u.u_res, rd.size[0], rd.size[1]);
      gl.uniform1f(u.u_heat, heat);
      gl.uniform1f(u.u_scale, rd.patternScale);
      gl.uniform1f(u.u_zoom, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      out['glErr' + heat] = gl.getError();

      const w = 400, h = 260;
      const px = new Uint8Array(w * h * 4);
      const x0 = Math.floor((rd.size[0] - w) / 2), y0 = Math.floor((rd.size[1] - h) / 2);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, max = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114;
        sum += l; if (l > max) max = l;
      }
      let diff = 0, cnt = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        diff += Math.abs(px[i] - px[i + 4]); cnt++;
      }
      out['raw' + heat] = { mean: +(sum / (px.length / 4)).toFixed(2), max: Math.round(max), edge: +(diff / cnt).toFixed(2) };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return JSON.stringify(out, null, 1);
  })()`);
  console.log('\n[纹样单渲量测]');
  console.log(probe);

  /* 逐段量：纹样 → 离屏目标 → 合成上屏，看亮度在哪一步掉下去 */
  const chain = await evalJs(`(() => {
    const rd = window.__XM_RENDERER__;
    const gl = rd.gl;
    const rd2 = (fb, w, h) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, max = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114;
        sum += l; if (l > max) max = l;
      }
      return { mean: +(sum / (px.length / 4)).toFixed(2), max: Math.round(max) };
    };
    rd.heat = 1;
    rd.render({ time: 1.2, velocity: 0, frame: 2, heat: 1 });
    const rtVals = rd2(rd.rt.fb, rd.rt.w, rd.rt.h);
    const scrVals = rd2(null, rd.size[0], rd.size[1]);
    return JSON.stringify({ rt: rtVals, screen: scrVals, rtSize: [rd.rt.w, rd.rt.h], size: rd.size });
  })()`);
  console.log('\n[合成链逐段]');
  console.log(chain);

  /* 分辨实验：分别把浮尘、壁面、暗角关掉，看哪一项吃掉了亮度。
     做法是把对应 uniform 归零后重画一帧再读。 */
  const isolate = await evalJs(`(() => {
    const rd = window.__XM_RENDERER__;
    const gl = rd.gl;
    const read = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const px = new Uint8Array(rd.size[0] * rd.size[1] * 4);
      gl.readPixels(0, 0, rd.size[0], rd.size[1], gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, max = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114;
        sum += l; if (l > max) max = l;
      }
      return { mean: +(sum / (px.length / 4)).toFixed(2), max: Math.round(max) };
    };
    const drawAir = (opts) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, rd.size[0], rd.size[1]);
      gl.disable(gl.BLEND);
      gl.useProgram(rd.pChapterAir);
      rd._bindQuad(rd.pChapterAir);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rd.ping.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, rd.rt.tex);
      gl.uniform1i(rd.uCAir.a.u_air, 0);
      gl.uniform1i(rd.uCAir.a.u_layer, 1);
      gl.uniform2f(rd.uCAir.u.u_buf, rd.size[0], rd.size[1]);
      gl.uniform1f(rd.uCAir.u.u_time, 2.0);
      gl.uniform1f(rd.uCAir.u.u_wallGain, opts.wall);
      gl.uniform1f(rd.uCAir.u.u_heat, 1.0);
      gl.uniform1f(rd.uCAir.u.u_vigHeavy, opts.vig);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return read();
    };
    // 先把纹样重新渲进 rt
    rd.heat = 1;
    rd.render({ time: 2.0, velocity: 0, frame: 5, heat: 1 });
    return JSON.stringify({
      normal:  drawAir({ wall: 0.9, vig: 0 }),
      noWall:  drawAir({ wall: 0,   vig: 0 }),
      heavyVig:drawAir({ wall: 0.9, vig: 1 }),
    });
  })()`);
  console.log('\n[分辨实验]（同一帧，只改合成参数）');
  console.log(isolate);

  /* 终极分辨：写一个"只输出 u_layer"的最小着色器。
     如果它也是黑的，问题在纹理采样；如果不黑，问题在合成公式。 */
  const minimal = await evalJs(`(() => {
    const rd = window.__XM_RENDERER__;
    const gl = rd.gl;
    const vs = 'attribute vec2 a_p; void main(){ gl_Position = vec4(a_p, 0.0, 1.0); }';
    const fs = 'precision highp float; uniform sampler2D u_layer;' +
      ' void main(){ gl_FragColor = vec4(texture2D(u_layer, gl_FragCoord.xy / ' +
      rd.size[0] + '.0 * vec2(1.0, ' + (rd.size[0] / rd.size[1]).toFixed(4) + ')).rgb, 1.0); }';
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return { err: gl.getShaderInfoLog(sh) }; return sh; };
    const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    if (v.err) return JSON.stringify({ vsErr: v.err });
    if (f.err) return JSON.stringify({ fsErr: f.err });
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return JSON.stringify({ linkErr: gl.getProgramInfoLog(p) });

    rd.heat = 1;
    rd.render({ time: 3.0, velocity: 0, frame: 9, heat: 1 });

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, rd.size[0], rd.size[1]);
    gl.disable(gl.BLEND);
    gl.useProgram(p);
    const loc = gl.getAttribLocation(p, 'a_p');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rd.rt.tex);
    gl.uniform1i(gl.getUniformLocation(p, 'u_layer'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const px = new Uint8Array(rd.size[0] * rd.size[1] * 4);
    gl.readPixels(0, 0, rd.size[0], rd.size[1], gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0, max = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114;
      sum += l; if (l > max) max = l;
    }
    return JSON.stringify({ mean: +(sum / (px.length / 4)).toFixed(2), max: Math.round(max), err: gl.getError() });
  })()`);
  console.log('\n[最小采样测试]（只输出 u_layer）');
  console.log(minimal);

  const p = JSON.parse(probe);
  if (p.heat1) {
    const lum = p.heat1.mean;
    const edge = p.heat1.edge;
    console.log('\n  heat=1 时：平均亮度 ' + lum + '  边强度 ' + edge + '  最大 ' + p.heat1.max);
    if (lum < 3) console.log('  → 几乎全黑，纹样没画出来或被压没了');
    else if (edge < 1.5) console.log('  → 有亮度但没结构，说明不是纹样');
    else console.log('  → 有亮度也有结构，纹样在画，只是整体偏暗');
  }

  ws.close();
} catch (e) { console.error('错误：' + e.message); }
finally { chrome.kill(); server.close(); await sleep(200); }
