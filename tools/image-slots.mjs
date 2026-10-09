/* 全站图片引用审计：数据里、HTML 里引用的每一张图，在不在磁盘上。
   给"我去弄图"一张准确清单 —— 别让人按记忆找。 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* 反引号与单引号都可能是路径的定界符，所以在正则里都认 */
const PATH_RE = /['"`]((?:\.\.\/|[a-z])[^'"`\s]*?\.(?:webp|png|jpe?g|avif|mp4|webm|mp3))['"`]/g;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(f) && !p.includes('dist')) out.push(p);
  }
  return out;
}

console.log('\n[全站图片引用审计]\n');

const missing = [];
const found = [];
for (const file of walk(join(root, 'js')).concat(walk(join(root, '')))) {
  if (!/\.(js|html)$/.test(file)) continue;
  const s = readFileSync(file, 'utf8');
  for (const m of s.matchAll(PATH_RE)) {
    const rel = m[1];
    if (!/assets\//.test(rel)) continue;
    const target = resolve(dirname(file), rel);
    const hit = existsSync(target) ||
      ['.webp', '.png', '.jpg', '.jpeg', '.avif'].some((e) =>
        existsSync(target.replace(/\.[a-z0-9]+$/i, e)));
    const from = relative(root, file).replace(/\\/g, '/');
    const rec = { rel, from, hit, target };
    (hit ? found : missing).push(rec);
  }
}

/* 去重：同一条路径被多处引用只报一次 */
const uniq = (arr) => {
  const map = new Map();
  for (const r of arr) {
    if (!map.has(r.rel)) map.set(r.rel, r);
  }
  return [...map.values()];
};

const M = uniq(missing);
const F = uniq(found);

console.log('  引用了、文件在的：' + F.length + ' 条');
F.forEach((r) => console.log('     ok   ' + r.rel.padEnd(52) + ' ← ' + r.from));

console.log('\n  引用了、**文件不在**的：' + M.length + ' 条');
M.forEach((r) => console.log('     ★缺  ' + r.rel.padEnd(52) + ' ← ' + r.from));

/* assets/img 下各目录存量 */
console.log('\n  assets/img 各目录：');
const base = join(root, 'assets/img');
const dirs = readdirSync(base);
for (const d of dirs) {
  const p = join(base, d);
  try {
    if (!statSync(p).isDirectory()) continue;
    const imgs = [];
    const rec = (dir2) => {
      for (const f of readdirSync(dir2)) {
        const q = join(dir2, f);
        if (statSync(q).isDirectory()) rec(q);
        else if (/\.(webp|png|jpe?g|avif)$/i.test(f)) imgs.push(relative(base, q).replace(/\\/g, '/'));
      }
    };
    rec(p);
    console.log('     ' + d.padEnd(16) + imgs.length + ' 张' +
      (imgs.length ? '' : '   ★ 空的'));
    if (imgs.length && imgs.length <= 12) imgs.forEach((x) => console.log('          ' + x));
  } catch { /* 不是目录 */ }
}

console.log('\n  合计：缺 ' + M.length + ' 张\n');
