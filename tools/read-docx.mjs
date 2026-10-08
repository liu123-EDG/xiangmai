/* 读 docx 的正文。
   docx 是个 zip，正文在 word/document.xml 里。
   用 Node 自带的 zlib 解压 —— 机器上没有 unzip/pandoc，也不该为这个装东西。
   只读，不改原文件。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'extracted');
mkdirSync(outDir, { recursive: true });

/** 从 zip 里取出指定文件的原始字节（只支持 stored 与 deflate） */
function unzipEntry(buf, want) {
  // 从尾部找 EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === want) {
      const lnameLen = buf.readUInt16LE(lho + 26);
      const lextraLen = buf.readUInt16LE(lho + 28);
      const start = lho + 30 + lnameLen + lextraLen;
      const raw = buf.subarray(start, start + csize);
      return method === 0 ? raw : inflateRawSync(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** 把 word/document.xml 转成纯文本（按段落切） */
function xmlToText(xml) {
  const out = [];
  /* 段落切分要**同时认 <w:p> 和 <w:tr>**：
     有些 docx 把内容放在表格里，只切 <w:p> 会把单元格粘成一片，
     还会把 <w:tab/>、<w:rPr> 这些标签原样带出来（壮族那份踩过）。 */
  const paras = xml.split(/<w:p[ >]|<w:tr[ >]/).slice(1);
  for (const para of paras) {
    const runs = [...para.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    let line = runs.join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
    out.push(line);
  }
  return out
    .join('\n')
    /* 兜底：万一还有残留标签（自闭合的那种读不到 w:t 里，
       但可能落在兄弟节点文本里），一并清掉，别让它进正文。 */
    .replace(/<[^>]{0,200}>/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('用法: node tools/read-docx.mjs <a.docx> [b.docx ...]');
  process.exit(1);
}

for (const f of files) {
  const buf = readFileSync(f);
  const xml = unzipEntry(buf, 'word/document.xml');
  if (!xml) { console.log('\n' + basename(f) + '  → 解不出 document.xml'); continue; }
  const text = xmlToText(xml.toString('utf8'));
  const lines = text.split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  const outPath = join(outDir, basename(f).replace(/\.docx$/i, '.txt'));
  writeFileSync(outPath, text, 'utf8');
  console.log('\n════ ' + basename(f) + ' ════');
  console.log('  段落 ' + lines.length + '，其中非空 ' + nonEmpty.length +
    '，总字数约 ' + text.replace(/\s/g, '').length);
  console.log('  已存 → docs/extracted/' + basename(outPath));
  console.log('  开头 5 段：');
  nonEmpty.slice(0, 5).forEach((l) => console.log('    ' + l.trim().slice(0, 90)));
}
