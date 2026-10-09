/* 数一数节奏台三段的记号数。
   直接 import 真数据，不另抄一份 —— 抄的那份迟早和源码脱节。
   判据：三段必须**递增**（疏 → 满 → 断），
   不然"最急最密然后切断"这句话在画面上读不出来。 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/lib/rhythm-lab.js'), 'utf8');

/* 只取 STAGES 那一段文本，然后按段落切开 */
const i = src.indexOf('const STAGES');
const j = src.indexOf('\n];', i);
const seg = src.slice(i, j + 3);
const blocks = seg.split(/\n  \{\n/).slice(1);

console.log('\n[节奏台三段密度]\n');
const counts = [];
for (const b of blocks) {
  const id = (b.match(/id: '([^']+)'/) || [])[1] || '?';
  const label = (b.match(/label: '([^']+)'/) || [])[1] || '?';
  const bpm = (b.match(/bpm: (\d+)/) || [])[1];
  const cut = /cut: true/.test(b);
  const cutAt = Number((b.match(/cutAt: (\d+)/) || [])[1] || 0);

  let n = 0;
  const per = {};
  for (const key of ['dum', 'tek', 'sapayi']) {
    const re = new RegExp(key + ':\\s*\\{([^}]*)\\}');
    const m = b.match(re);
    if (!m) { per[key] = 0; continue; }
    const beats = Array.from(m[1].matchAll(/([0-9.]+):/g)).map((x) => parseFloat(x[1]));
    const live = beats.filter((x) => !(cut && x >= cutAt));
    per[key] = live.length;
    n += live.length;
  }
  counts.push({ id, label, bpm, n, cut, cutAt, per });
  console.log('  ' + label.padEnd(4) + '（' + id.padEnd(7) + ' ' + bpm + ' BPM）  ' +
    String(n).padStart(2) + ' 个记号   ' +
    '手鼓 ' + per.dum + ' / 铁环 ' + per.tek + ' / 萨帕依 ' + per.sapayi +
    (cut ? '   ← 切断于第 ' + cutAt + ' 拍（后面不画）' : ''));
}

console.log('');
let bad = 0;
for (let k = 1; k < counts.length; k++) {
  if (counts[k].n > counts[k - 1].n) {
    console.log('  ok   ' + counts[k - 1].label + ' → ' + counts[k].label +
      '：' + counts[k - 1].n + ' → ' + counts[k].n + ' 个记号，是递增的');
  } else {
    bad++;
    console.log('  FAIL ' + counts[k - 1].label + ' → ' + counts[k].label +
      '：' + counts[k - 1].n + ' → ' + counts[k].n + ' —— **没有递增**，"最急最密"读不出来');
  }
}
const bpms = counts.map((c) => Number(c.bpm));
if (bpms[0] < bpms[1] && bpms[1] < bpms[2]) {
  console.log('  ok   速度也递增：' + bpms.join(' → ') + ' BPM');
} else {
  bad++;
  console.log('  FAIL 速度没有递增：' + bpms.join(' → '));
}
if (counts[counts.length - 1].cut) console.log('  ok   最后一段有切断点（第 ' + counts[counts.length - 1].cutAt + ' 拍）');
else { bad++; console.log('  FAIL 最后一段没有切断点'); }

console.log('\n' + (bad ? '✗ ' + bad + ' 项不合格\n' : '✓ 三段密度递增，切断了\n'));
process.exit(bad ? 1 : 0);
