/* 把刚收到的 8 段视频收进 assets/video/inherit/，并核对基本信息。
   文件名按关键词文档的编号（1-A / 1-B …），收进来之后改成有意义的英文名，
   免得以后看代码要对着一张表才知道 1-B 是哪段。 */
import { copyFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const attach = 'C:/Users/HP/.dsh/attachments/v1/files';

/* 编号 → 语义名。对应 docs/inheritance-game-video-prompts.md */
const MAP = {
  '1-A.mp4': ['gobi.mp4',     '场景一 戈壁环境'],
  '1-B.mp4': ['qon-live.mp4', '场景一 选对：文化活着'],
  '1-C.mp4': ['qon-lost.mp4', '场景一 选错：文化失传'],
  '1-D.mp4': ['qon-case.mp4', '场景一 成功案例'],
  '2-A.mp4': ['steppe.mp4',   '场景二 草原环境'],
  '2-B.mp4': ['tib-live.mp4', '场景二 选对：文化活着'],
  '2-C.mp4': ['tib-lost.mp4', '场景二 选错：文化失传'],
  '2-D.mp4': ['tib-case.mp4', '场景二 成功案例'],
};

/* 在附件目录里按文件名找。
   它们散在各自的 sha256 子目录里，所以要**递归**找 ——
   只读顶层目录会一个都找不到（踩过）。 */
function find(name) {
  const walk = (dir, depth) => {
    if (depth > 3) return null;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const hit = walk(p, depth + 1);
        if (hit) return hit;
      } else if (e.name === name) {
        return p;
      }
    }
    return null;
  };
  return walk(attach, 0);
}

const outDir = join(root, 'assets/video/inherit');
mkdirSync(outDir, { recursive: true });

console.log('\n════════ 收 8 段视频 ════════\n');
const missing = [];
const rows = [];

for (const [src, [dst, label]] of Object.entries(MAP)) {
  const from = find(src);
  if (!from) { missing.push(src); console.log('  ✗ ' + src + ' 没找到'); continue; }
  const to = join(outDir, dst);
  copyFileSync(from, to);
  const kb = Math.round(statSync(to).size / 1024);
  rows.push({ dst, label, kb, path: to });
  console.log('  ✓ ' + src.padEnd(8) + '→ ' + dst.padEnd(14) +
    String(kb).padStart(6) + ' KB   ' + label);
}

if (missing.length) {
  console.log('\n  缺 ' + missing.length + ' 段：' + missing.join(' '));
}

console.log('\n════════ 逐段核对 ════════\n');
let total = 0;
for (const r of rows) {
  total += r.kb;
  try {
    const out = execFileSync('node', ['tools/mp4info.mjs', r.path],
      { cwd: root, encoding: 'utf8' });
    const line = out.split('\n').find((l) => /×/.test(l)) || '';
    console.log('  ' + r.dst.padEnd(14) + line.trim());
  } catch (e) {
    console.log('  ' + r.dst.padEnd(14) + '读不出信息');
  }
}
console.log('\n  合计 ' + (total / 1024).toFixed(1) + ' MB  （8 段）');
console.log('  平均每段 ' + (total / 8 / 1024).toFixed(2) + ' MB\n');
