/* 结构检查：标签配平、旧类名清干净、新容器都在。 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const s = readFileSync(join(root, 'lishi/index.html'), 'utf8');

const count = (re) => (s.match(re) || []).length;
const pairs = [
  ['section', count(/<section\b/g), count(/<\/section>/g)],
  ['div', count(/<div\b/g), count(/<\/div>/g)],
  ['article', count(/<article\b/g), count(/<\/article>/g)],
  ['ol', count(/<ol\b/g), count(/<\/ol>/g)],
  ['ul', count(/<ul\b/g), count(/<\/ul>/g)],
  ['figure', count(/<figure\b/g), count(/<\/figure>/g)],
];

console.log('\n[第五章结构]\n');
let bad = 0;
pairs.forEach(([tag, a, b]) => {
  const ok = a === b;
  if (!ok) bad++;
  console.log('  ' + tag.padEnd(9) + a + ' / ' + b + (ok ? '  ✓' : '  ★ 不配平'));
});

const legacy = [
  ['旧案例块', /class="cases"/],
  ['旧案例卡', /class="case__/],
  ['旧轨道卡', /class="tracks"/],
  ['旧轨道', /class="track\b/],
  ['空图位', /class="slot/],
  ['旧时间轴', /class="timeline"/],
  ['旧数字块', /class="numbers"/],
];
console.log('');
legacy.forEach(([name, re]) => {
  const gone = !re.test(s);
  if (!gone) bad++;
  console.log('  ' + (gone ? '清掉了  ' : '★ 还留着 ') + name);
});

const hosts = ['tls-host', 'subtract-host', 'recorder-host', 'rails-host', 'cases-host'];
console.log('');
hosts.forEach((id) => {
  const has = s.includes('id="' + id + '"');
  if (!has) bad++;
  console.log('  ' + (has ? '在      ' : '★ 缺   ') + '#' + id);
});

// 图注位这种"占位文字"不该再出现
const placeholder = /图片位|图注位/.test(s);
if (placeholder) bad++;
console.log('\n  ' + (placeholder ? '★ 还有「图片位/图注位」占位文字' : '没有残留的占位文字'));

console.log('\n' + (bad ? '✗ ' + bad + ' 项有问题\n' : '✓ 结构干净\n'));
process.exit(bad ? 1 : 0);
