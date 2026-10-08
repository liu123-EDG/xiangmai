/* 查两个老失败的原因 —— 只读，不改任何东西。 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

console.log('\n[1] 第二章（chapter-test 查的那一页）\n');
const q = read('qiongnaieman/index.html');
const count = (s, re) => (s.match(re) || []).length;
console.log('  figure.slot 数量 = ' + count(q, /figure class="slot/g));
console.log('  class="act" 数量 = ' + count(q, /class="act"/g));
console.log('  页面上出现的 class（去重）：');
const classes = [...new Set((q.match(/class="[^"]+"/g) || []).map((m) => m.slice(7, -1)))]
  .flatMap((c) => c.split(/\s+/));
console.log('    ' + classes.filter((c) => c).slice(0, 30).join(' '));

console.log('\n[2] 全站还剩几个 figure.slot\n');
const pages = ['index.html', 'qiongnaieman/index.html', 'dastan/index.html', 'mashrap/index.html',
  'lishi/index.html', 'fulu/index.html', 'welcome/index.html', 'game/index.html'];
pages.forEach((p) => {
  if (!existsSync(join(root, p))) { console.log('  ' + p + '  （不存在）'); return; }
  const s = read(p);
  console.log('  ' + p.padEnd(24) + ' figure.slot = ' + count(s, /figure class="slot/g) +
    '   slot 类名出现 ' + count(s, /class="slot/g) + ' 次');
});

console.log('\n[3] 顶栏导航在窄屏下的样子\n');
const css = read('styles.css');
// 找 sitelinks 相关的窄屏规则
const idx = css.indexOf('@media (max-width: 720px)');
if (idx >= 0) {
  const block = css.slice(idx, css.indexOf('\n}\n', idx) + 3);
  console.log('  @media (max-width: 720px) 块里提到 sitelinks 吗：' +
    (/sitelinks/.test(block) ? '是' : '否'));
}
const sitelines = css.split('\n').map((l, i) => [i + 1, l])
  .filter(([, l]) => /sitelinks/.test(l));
console.log('  styles.css 里 sitelinks 相关行共 ' + sitelines.length + ' 条：');
sitelines.slice(0, 12).forEach(([n, l]) => console.log('    ' + n + ': ' + l.trim()));

console.log('\n[4] site.js 现在的导航结构\n');
const site = read('js/lib/site.js');
const navBlock = site.slice(site.indexOf('const NAV'), site.indexOf('];', site.indexOf('const NAV')) + 2);
console.log('  NAV 条目数 = ' + count(navBlock, /\{ id:/g));
console.log('  mountShell 渲染出的选择器：');
[...new Set((site.match(/class="[a-z-]*(sitelink|nav|burger)[a-z-]*"/g) || []))].forEach((m) =>
  console.log('    ' + m));
console.log('');
