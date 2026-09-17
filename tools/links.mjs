/* ==========================================================================
   交付链接
   --------------------------------------------------------------------------
   每次改完、构建完之后跑这个，它会把两套地址打出来：

     file://  电脑上双击就能开（本机文件）
     http://  手机上要用的局域网地址（file:// 在手机上永远打不开）

   用法：node tools/links.mjs
   ========================================================================== */
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;

/** 页面清单，与 js/lib/site.js 的 NAV 对应 */
const PAGES = [
  ['序', 'index.html'],
  ['二 · 穹乃额曼', 'qiongnaieman/index.html'],
  ['三 · 达斯坦', 'dastan/index.html'],
  ['四 · 麦西热甫', 'mashrap/index.html'],
  ['五 · 历史与传承', 'lishi/index.html'],
  ['附录 · 形制比较', 'fulu/index.html'],
];

const ips = [];
const nets = networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const n of nets[name] || []) {
    if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }
}

// 构建产物是否最新（这里只做存在性检查，严格校验归 verify.mjs）
const stale = PAGES
  .flatMap(([, p]) => {
    const html = join(root, p);
    if (!existsSync(html)) return [p];
    const m = readFileSync(html, 'utf8').match(/src="([^"]*js\/dist\/[^"]+)"/);
    if (!m) return [];
    const abs = join(dirname(html), m[1]);
    return existsSync(abs) ? [] : ['缺少产物：' + m[1] + '（跑 node tools/build.mjs）'];
  });

const W = 34;
console.log('');
console.log('  ══════════════════════════════════════════════════');
console.log('   弦脉 · 交付链接');
console.log('  ══════════════════════════════════════════════════');
console.log('');
console.log('  【手机打开】要和电脑连同一个 WiFi');
ips.forEach((ip) => console.log('    http://' + ip + ':' + PORT + '/'));
if (!ips.length) console.log('    （没找到局域网 IP，检查 WiFi）');
console.log('');
console.log('  【电脑打开】直接双击文件也行');
PAGES.forEach(([name, p]) => {
  console.log('    ' + name.padEnd(10) + ' file:///' + join(root, p).replace(/\\/g, '/'));
});
console.log('');
if (ips.length) {
  console.log('  【手机 · 直达某一页】');
  PAGES.forEach(([name, p]) => {
    console.log('    ' + name.padEnd(10) + ' http://' + ips[0] + ':' + PORT + '/' +
      p.replace(/index\.html$/, ''));
  });
  console.log('');
}
if (stale.length) {
  console.log('  !! 构建产物有问题：');
  stale.forEach((s) => console.log('     ' + s));
  console.log('');
}
console.log('  服务没起来就运行： node tools/serve.mjs ' + PORT);
console.log('');
