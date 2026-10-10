/* 把抽出来的 docx 图片整理成一张对照表：哪份文档、哪些图、多大、什么格式。
   目的是让作者能一眼看出"哪张能用在哪一页"。 */
import { readdirSync, statSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs', 'docx-images');

/* 清掉解压出来的 0 字节垃圾条目 */
for (const f of readdirSync(dir)) {
  const p = join(dir, f);
  if (statSync(p).isFile() && statSync(p).size < 1024) {
    unlinkSync(p);
    console.log('  清掉空文件 ' + f);
  }
}

const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const byDoc = new Map();
for (const f of files) {
  const m = /^(.+?)-(image\d+)/.exec(f);
  const doc = m ? m[1] : '其他';
  if (!byDoc.has(doc)) byDoc.set(doc, []);
  byDoc.get(doc).push({ f, size: statSync(join(dir, f)).size });
}

console.log('\n[docx 抽出的图片 · 按文档分]\n');
let n = 0;
for (const [doc, list] of byDoc) {
  list.sort((a, b) => b.size - a.size);
  console.log('  ── ' + doc + '  (' + list.length + ' 张) ──');
  list.forEach((x) => {
    console.log('     ' + x.f.padEnd(34) + Math.round(x.size / 1024) + ' KB');
    n++;
  });
}
console.log('\n  合计 ' + n + ' 张，在 docs/docx-images/\n');
