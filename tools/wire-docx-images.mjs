/* 把 docx 里抽出的图接进八族分页。
   做法：
     1) 按文档名对应到 heritage 的 id，拷进 assets/img/heritage/<id>/
     2) 顺手压成 webp（质量 82，长边不超过 1600）—— 站里别的图都是 webp
     3) 数据里加一个 images 字段，页面自动带上

   **不猜内容**：文件名里的 image1/2/3 顺序就是文档里的顺序，
   所以它对应哪一段文字是**作者那边知道的**。这里只做"文档 → 民族"的对应，
   不断言每张图拍的是什么（页面上会写"资料配图"并标注出处）。
   ========================================================================== */
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'docs', 'docx-images');

/* 文档名 → heritage id。只有明确能对上的才接。 */
const MAP = {
  '傣族文化': 'dai-zhangha',
  '壮族': 'zhuang-tianqin',
  '彝族文化': 'yi-shan-ge',
  '满族': 'manchu-xinchengxi',
  '苗族文化': 'miao-guge',
  '蒙古族文化': 'mongol-morinhuur',
  '少数民族文化': null,   // 混了多族，不硬塞给某一个 —— 见下面单独处理
  '侗族大歌': 'dong-dage',   // 没图
  '苗族古歌': 'miao-guge',   // 没图
  '彝族山歌': 'yi-shan-ge',  // 没图
  '藏族格萨尔': 'tibetan-gesar',  // 没图
};

/* 先把文件分好类 */
const plan = new Map();
for (const f of readdirSync(srcDir)) {
  if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
  const m = /^(.+?)-(image\d+)/.exec(f);
  if (!m) continue;
  const id = MAP[m[1]];
  if (!id) continue;
  if (!plan.has(id)) plan.set(id, []);
  plan.get(id).push({ file: f, size: statSync(join(srcDir, f)).size });
}

console.log('\n[接图计划]\n');
for (const [id, list] of plan) {
  list.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
  console.log('  ' + id.padEnd(20) + list.length + ' 张   ' +
    list.map((x) => x.file.replace(/^.*-image/, 'img') + '(' + Math.round(x.size / 1024) + 'K)').join(' '));
}
const skipped = readdirSync(srcDir)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .filter((f) => { const m = /^(.+?)-(image\d+)/.exec(f); return !m || !MAP[m[1]]; });
if (skipped.length) {
  console.log('\n  没接（文档混了多族或对不上）：' + skipped.length + ' 张');
  console.log('    ' + skipped.join(' '));
}
console.log('');

/* 拷贝（webp 转换交给浏览器做，见下） */
const outBase = join(root, 'assets', 'img', 'heritage');
mkdirSync(outBase, { recursive: true });
const copied = [];
for (const [id, list] of plan) {
  const dir = join(outBase, id);
  mkdirSync(dir, { recursive: true });
  list.forEach((x, i) => {
    const dst = join(dir, 'doc-' + (i + 1) + '.jpg');
    copyFileSync(join(srcDir, x.file), dst);
    copied.push({ id, dst, from: x.file });
  });
  console.log('  ' + id.padEnd(20) + '→ assets/img/heritage/' + id + '/doc-1..' + list.length + '.jpg');
}

/* ---- 用浏览器把 jpg 转成 webp（站里别的图都是 webp，体积能小一半）---- */
if (copied.length && !process.argv.includes('--no-webp')) {
  console.log('\n  转 webp…');
  const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(root, p);
      const st = await stat(file);
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': st.size });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(''); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const PORT = server.address().port;
  const userDir = join(root, '.chrome-webp');
  mkdirSync(userDir, { recursive: true });
  const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=10611',
    `--user-data-dir=${userDir}`, '--no-first-run', '--hide-scrollbars',
    '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let target = null;
    for (let i = 0; i < 80 && !target; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:10611/json/list')).json();
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
    const evalJs = async (expr, t = 90000) => {
      const r = await send('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true, timeout: t });
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
      return r.result.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await sleep(600);

    let before = 0, after = 0;
    for (const c of copied) {
      const rel = c.dst.replace(root, '').replace(/\\/g, '/');
      const raw = await evalJs(`(async () => {
        const buf = await (await fetch('${rel}')).arrayBuffer();
        const bmp = await createImageBitmap(new Blob([buf]));
        /* 长边不超过 1600：站里最大展示宽度约 1180，1600 足够 */
        const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
        const blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.82));
        const ab = await blob.arrayBuffer();
        const u8 = new Uint8Array(ab);
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < u8.length; i += CH) {
          bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
        }
        return JSON.stringify({ b64: btoa(bin), w, h, bytes: u8.length });
      })()`);
      const r = JSON.parse(raw);
      const out = c.dst.replace(/\.jpg$/, '.webp');
      await writeFile(out, Buffer.from(r.b64, 'base64'));
      const b = statSync(c.dst).size, a = statSync(out).size;
      before += b; after += a;
      /* 删掉 jpg，只留 webp —— 免得仓库里两份 */
      if (!process.argv.includes('--keep-jpg')) {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(c.dst);
      }
    }
    console.log('     ' + copied.length + ' 张：' + Math.round(before / 1024) + ' KB → ' +
      Math.round(after / 1024) + ' KB（省 ' + Math.round(100 - after / before * 100) + '%）');
    ws.close();
  } catch (e) {
    console.error('    转 webp 失败：' + e.message);
  } finally {
    chrome.kill(); server.close(); await sleep(200);
  }
}
console.log('');
