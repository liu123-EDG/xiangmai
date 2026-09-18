/* 量一下从 CDN 拉素材的真实速度，判断"卡"是带宽问题还是文件太大。 */
import { writeFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://liu123-edg.github.io/xiangmai/';
const tmp = join(process.env.TEMP || '.', 'xm-speed.bin');

async function speed(path) {
  const url = BASE + path;
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    if (!res.ok) return { path, err: 'HTTP ' + res.status };
    let bytes = 0;
    const chunks = [];
    for await (const c of res.body) {
      bytes += c.length;
      chunks.push(c);
      // 只读到 1.5MB 就够算速度了，别把整个文件拖下来
      if (bytes > 1536 * 1024) break;
    }
    const ms = Date.now() - t0;
    const kbps = bytes / 1024 / (ms / 1000);
    return {
      path,
      got: (bytes / 1024).toFixed(0) + ' KB',
      ms,
      kbps: kbps.toFixed(0),
      headers: {
        len: res.headers.get('content-length'),
        ranges: res.headers.get('accept-ranges'),
        cache: res.headers.get('cache-control'),
        enc: res.headers.get('content-encoding'),
      },
    };
  } catch (e) {
    return { path, err: e.message };
  }
}

console.log('\n════════ CDN 拉取速度实测 ════════\n');
console.log('（读到 1.5MB 即停，算平均速度。视频要边下边播，这个数字直接决定卡不卡）\n');

const files = [
  'assets/video/reveal/01-mural.mp4',
  'assets/video/reveal/02-drain.mp4',
  'assets/video/reveal/03-black.mp4',
];

const results = [];
for (const f of files) {
  const r = await speed(f);
  results.push(r);
  if (r.err) { console.log('  ' + f.split('/').pop().padEnd(18) + '失败：' + r.err); continue; }
  console.log('  ' + f.split('/').pop().padEnd(18) +
    r.kbps.padStart(6) + ' KB/s   ' + r.got.padStart(9) + ' / ' + r.ms + 'ms');
  console.log('      Accept-Ranges=' + r.headers.ranges +
    '  Content-Length=' + r.headers.len +
    '  Cache=' + String(r.headers.cache).slice(0, 30));
}

const ok = results.filter((r) => r.kbps);
if (ok.length) {
  const avg = ok.reduce((a, r) => a + Number(r.kbps), 0) / ok.length;
  console.log('\n  平均 ' + avg.toFixed(0) + ' KB/s');
  const need = 9265 / (avg / 1024);   // 最大那个文件下完要多久
  console.log('  按这个速度，9MB 那段要下 ' + need.toFixed(1) + ' 秒');
  if (avg < 400) {
    console.log('\n  → 带宽是瓶颈。文件再压也救不了多少，要考虑换托管或降码率。');
  } else if (avg < 1200) {
    console.log('\n  → 勉强够播 1Mbps 的片子，但开局要等。降码率会有明显改善。');
  } else {
    console.log('\n  → 带宽够，卡的原因多半是文件太大/码率太高。压缩最有效。');
  }
}

console.log('');
