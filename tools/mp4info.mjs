/* 读 MP4 的基本信息：时长、分辨率、帧率。
   没有 ffmpeg，直接解析容器 —— moov/mvhd 给时长，trak/tkhd 给宽高。 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

function walk(buf, start, end, path, out) {
  let p = start;
  while (p + 8 <= end) {
    const size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    if (size < 8 || p + size > end) break;
    const body = p + 8;
    out.push({ type, path: path + '/' + type, start: body, size: size - 8 });
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts'].includes(type)) {
      walk(buf, body, p + size, path + '/' + type, out);
    }
    p += size;
  }
}

function info(file) {
  const buf = readFileSync(file);
  const boxes = [];
  walk(buf, 0, buf.length, '', boxes);

  const out = { file: basename(file), bytes: buf.length };
  const mvhd = boxes.find((b) => b.type === 'mvhd');
  if (mvhd) {
    const v = buf[mvhd.start];
    if (v === 1) {
      out.timescale = buf.readUInt32BE(mvhd.start + 20);
      out.duration = Number(buf.readBigUInt64BE(mvhd.start + 24)) / out.timescale;
    } else {
      out.timescale = buf.readUInt32BE(mvhd.start + 12);
      out.duration = buf.readUInt32BE(mvhd.start + 16) / out.timescale;
    }
  }
  const tkhd = boxes.find((b) => b.type === 'tkhd');
  if (tkhd) {
    const v = buf[tkhd.start];
    const off = tkhd.start + (v === 1 ? 84 : 76);
    out.width = buf.readUInt32BE(off) / 65536;
    out.height = buf.readUInt32BE(off + 4) / 65536;
  }
  // 有没有音轨
  out.hasAudio = boxes.some((b) => b.type === 'smhd');
  out.hasVideo = boxes.some((b) => b.type === 'vmhd');
  return out;
}

const files = process.argv.slice(2);
console.log('');
for (const f of files) {
  const i = info(f);
  console.log('  ' + i.file);
  console.log('      ' + (i.width || '?') + '×' + (i.height || '?') +
    '   ' + (i.duration ? i.duration.toFixed(2) + ' 秒' : '时长未知') +
    '   ' + (i.bytes / 1024 / 1024).toFixed(1) + ' MB' +
    '   画面' + (i.hasVideo ? '有' : '无') + '  声音' + (i.hasAudio ? '有' : '无'));
}
const total = files.map((f) => info(f).duration || 0).reduce((a, b) => a + b, 0);
console.log('\n  三段合计 ' + total.toFixed(2) + ' 秒\n');
