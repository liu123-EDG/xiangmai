/* ==========================================================================
   从首屏截图里量出结构柱的包围盒（CSS 像素）。
   做法：逐列/逐行统计"明显亮于房间底色"的像素比例，取满足比例条件的最长连通区间。
   房间底色在 0.03–0.05，柱体在 0.06–0.13，阈值取 0.062 可稳定分开。
   输出 JSON：柱体包围盒 + 若干行的亮度剖面，便于人工核对。
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
const cssW = Number(process.argv[3] || 1440);
const cssH = Number(process.argv[4] || 900);
const THRESH = Number(process.argv[5] || 0.062);

const buf = readFileSync(file);
let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    bitDepth = data[8]; colorType = data[9]; interlace = data[12];
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  off += 12 + len;
}
if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
  console.error('unsupported png'); process.exit(3);
}
const bpp = colorType === 6 ? 4 : 3;
const raw = inflateSync(Buffer.concat(idat));
const stride = width * bpp;
const px = Buffer.alloc(height * stride);
let p = 0;
for (let y = 0; y < height; y++) {
  const f = raw[p++];
  const line = raw.subarray(p, p + stride); p += stride;
  const cur = px.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= bpp ? prev[x - bpp] : 0;
    let v = line[x];
    if (f === 1) v = (v + a) & 255;
    else if (f === 2) v = (v + b) & 255;
    else if (f === 3) v = (v + ((a + b) >> 1)) & 255;
    else if (f === 4) {
      const pp = a + b - c;
      const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
      v = (v + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 255;
    }
    cur[x] = v;
  }
}
const lum = (x, y) => {
  const i = (y * width + x) * bpp;
  return (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
};

// 只看画面中段，避开标题文字与底部刻度
const y0 = Math.round(height * 0.22), y1 = Math.round(height * 0.86);
const colFrac = new Float64Array(width);
for (let x = 0; x < width; x++) {
  let n = 0;
  for (let y = y0; y < y1; y += 2) if (lum(x, y) > THRESH) n++;
  colFrac[x] = n / ((y1 - y0) / 2);
}
// 取最长连通区间（允许 2px 空洞）
let bestS = -1, bestE = -1;
for (let s = 0; s < width; s++) {
  if (colFrac[s] <= 0.5) continue;
  let e = s, gap = 0;
  for (let x = s + 1; x < width; x++) {
    if (colFrac[x] > 0.5) { e = x; gap = 0; }
    else if (++gap > 3) break;
  }
  if (e - s > bestE - bestS) { bestS = s; bestE = e; }
  s = e;
}
let left = bestS, right = bestE;

const rowFrac = new Float64Array(height);
for (let y = 0; y < height; y++) {
  let n = 0;
  for (let x = left; x <= right; x += 2) if (lum(x, y) > THRESH) n++;
  rowFrac[y] = n / ((right - left) / 2 + 1);
}
let top = -1, bottom = -1;
for (let y = 0; y < height; y++) if (rowFrac[y] > 0.35) { top = y; break; }
for (let y = height - 1; y >= 0; y--) if (rowFrac[y] > 0.35) { bottom = y; break; }

const sc = width / cssW;
const toCss = (v) => +(v / sc).toFixed(1);
const mid = Math.round((top + bottom) / 2);
const profile = [];
for (let x = Math.max(0, left - 60); x <= Math.min(width - 1, right + 60); x += Math.max(1, Math.round(8 * sc))) {
  profile.push(toCss(x) + ':' + lum(x, mid).toFixed(3));
}

// 找红/绿/蓝标尺的像素位置，用来验证截图几何是否可信
const rulers = {};
for (let x = 0; x < width; x++) {
  let r = 0, g = 0, b = 0;
  for (let y = 0; y < height; y += 40) {
    const i = (y * width + x) * bpp;
    if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] < 60) r++;
    if (px[i + 1] > 200 && px[i] < 60 && px[i + 2] < 60) g++;
    if (px[i + 2] > 200 && px[i] < 60 && px[i + 1] < 60) b++;
  }
  if (r > 3) rulers.red = toCss(x);
  if (g > 3) rulers.green = toCss(x);
  if (b > 3) rulers.blue = toCss(x);
}

console.log(JSON.stringify({
  image: [width, height], cssScale: +sc.toFixed(3), thresh: THRESH,
  rulers,
  rulerExpect: { red: cssW * 0.25, green: cssW * 0.5, blue: cssW * 0.75 },
  box: { left: toCss(left), top: toCss(top), right: toCss(right), bottom: toCss(bottom),
         w: toCss(right - left), h: toCss(bottom - top) },
}));
