/* docx 里自带的图片 —— 从 zip 里把 word/media/ 下的图抽出来。
   为什么要看这个：作者提供的那几份 docx 很可能自带配图，
   那是**现成、无版权风险**的素材，比 AI 生成的更适合非遗题材。
   有的话就不用花时间生成了。 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'docx-images');
mkdirSync(outDir, { recursive: true });

/** 列出 zip 里所有条目（名字 + 大小），不解压内容 */
function listEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.push({ name, method, csize, usize, lho });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function readEntry(buf, ent) {
  const lnameLen = buf.readUInt16LE(ent.lho + 26);
  const lextraLen = buf.readUInt16LE(ent.lho + 28);
  const start = ent.lho + 30 + lnameLen + lextraLen;
  const raw = buf.subarray(start, start + ent.csize);
  return ent.method === 0 ? raw : inflateRawSync(raw);
}

/* 作者给的七个 docx 在附件目录 */
const A = 'C:/Users/HP/.dsh/attachments/v1/files';
const FILES = [
  [A + '/04/04d846a2446e8bde6057ced34e3eb3cfb7bb4b60fc3c3ba7bd170efb8c1a8283/少数民族文化.docx', '少数民族文化'],
  [A + '/86/86d24c3cb66647af0cfb127a31210bf756a1f076697b01761590d581173d130a/傣族文化.docx', '傣族文化'],
  [A + '/e7/e71205b0c50c80acd91885b1fae1193a8c0475918c1f2b33f00513b1f3d78f1d/苗族文化.docx', '苗族文化'],
  [A + '/71/71ed790a36bbedc95ad5fca7bb67f7c78c9a2ea54f164f25cb0b3c37c2d6b8ec/彝族文化.docx', '彝族文化'],
  [A + '/0c/0c91372b1a39e96620d31b055c1fd791fcecb7684ddd234beca3850b92dc8dd8/壮族.docx', '壮族'],
  [A + '/b7/b7789610e00fbe47c1f4ec40cbc87e36e95572d0407b419d13d9aa3063596ae2/满族.docx', '满族'],
  [A + '/3f/3ff366d1ca2ed625e46d87a53efaeaff4d16a7b75169028e5421f2636eed5b6e/蒙古族文化.docx', '蒙古族文化'],
  [A + '/42/42ab146632bfbd96736323a33740a3c1a85fd4ef8eaacce76b8b341fb464436e/侗族大歌资料.docx', '侗族大歌'],
  [A + '/41/416c81aa58ad28ec27ef8ea75723a63f8c975f73813bc42f0e8c5fa020189aba/苗族古歌资料.docx', '苗族古歌'],
  [A + '/11/116bdcd0a9d5d920ea9b7f4880fec8baab7b92d402ce55dd91b180366ec02cd9/彝族山歌小调资料.docx', '彝族山歌'],
  [A + '/f4/f48a731d2b19e916cefb34462546dc6ba5861d840815e69ad70f6a2a40f2c518/藏族格萨尔资料.docx', '藏族格萨尔'],
];

console.log('\n[docx 里自带的图片]\n');
let total = 0;
for (const [file, label] of FILES) {
  let buf;
  try { buf = readFileSync(file); } catch { console.log('  ' + label.padEnd(12) + '（读不到）'); continue; }
  const ents = listEntries(buf).filter((e) => /^word\/media\//i.test(e.name));
  if (!ents.length) { console.log('  ' + label.padEnd(12) + '没有图片'); continue; }
  let bytes = 0;
  const names = [];
  for (const e of ents) {
    try {
      const data = readEntry(buf, e);
      const out = join(outDir, label + '-' + basename(e.name));
      writeFileSync(out, data);
      bytes += data.length;
      names.push(basename(e.name) + '(' + Math.round(data.length / 1024) + 'KB)');
    } catch { /* 跳过坏的 */ }
  }
  total += ents.length;
  console.log('  ' + label.padEnd(12) + ents.length + ' 张  ' +
    Math.round(bytes / 1024) + 'KB  ' + names.slice(0, 6).join(' '));
}
console.log('\n  合计 ' + total + ' 张 → docs/docx-images/\n');
