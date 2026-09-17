/* 节奏空隙审计：逐句算出相邻两次触发的时间间隔，找出超过听觉节拍门槛
   （约 1.5 秒）的空档，并给出该在哪个拍位补轻音。
   用法：node tools/gap-audit.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/lib/sequencer.js'), 'utf8');

const THRESHOLD = 1.45;   // 秒。超过它，两声之间就不再被听成一个节奏型

const m = src.match(/const PATTERNS = \[([\s\S]*?)\n\];/);
if (!m) { console.error('解析不到 PATTERNS'); process.exit(1); }

const NAMES = ['穹乃额曼', '达斯坦', '麦西热甫'];
const bandChunks = m[1].split(/\/\/ ──/).slice(1);

let worstAll = 0;
let suggestions = 0;

bandChunks.forEach((chunk, bi) => {
  const bpm = +(chunk.match(/bpm:\s*(\d+)/) || [])[1];
  const pulseEvery = +(chunk.match(/pulseEvery:\s*(\d+)/) || [])[1] || 0;
  const guardM = chunk.match(/pulseGuard:\s*(\d+)/);
  const guard = guardM ? +guardM[1] : 1;
  const phrases = [...chunk.matchAll(/\{ div: (\d+), steps: \[([\s\S]*?)\]\s*\}/g)];
  console.log('\n' + (NAMES[bi] || ('段' + (bi + 1))) + '   bpm=' + bpm +
    '   脉冲每 ' + (pulseEvery || '—') + ' 步（避让 ' + guard + ' 步）');

  phrases.forEach((p, pi) => {
    const div = +p[1];
    const spb = 60 / bpm / div;
    const total = 12 * div;
    const main = [...p[2].matchAll(/b:\s*(\d+),\s*s:\s*'(\w+)'/g)]
      .map((x) => ({ b: +x[1], kind: x[2] }))
      .sort((a, b) => a.b - b.b);
    const mainBeats = new Set(main.map((h) => h.b));

    /* 真实触发序列 = 主节奏 + 脉冲轨（与 _tick 里的规则一致）：
       脉冲只在空拍位落点，且前后 pulseGuard 步内有主音就跳过。 */
    const onsets = main.map((h) => h.b);
    if (pulseEvery > 0) {
      for (let b = 0; b < total; b += pulseEvery) {
        if (mainBeats.has(b)) continue;
        let tooClose = false;
        for (let k = 1; k <= guard; k++) {
          const before = ((b - k) % total + total) % total;
          const after = (b + k) % total;
          if (mainBeats.has(before) || mainBeats.has(after)) { tooClose = true; break; }
        }
        if (!tooClose) onsets.push(b);
      }
    }
    onsets.sort((a, b) => a - b);

    // 句内相邻间隔
    let worstIn = 0, worstAt = -1;
    for (let i = 1; i < onsets.length; i++) {
      const dt = (onsets[i] - onsets[i - 1]) * spb;
      if (dt > worstIn) { worstIn = dt; worstAt = onsets[i - 1]; }
    }
    const tailGap = (total - onsets[onsets.length - 1]) * spb;
    worstAll = Math.max(worstAll, worstIn);

    const label = '  句' + (pi + 1) + ' div=' + div +
      ' 时长' + (total * spb).toFixed(2) + 's  主' + main.length +
      ' 含脉冲' + onsets.length + '记';
    if (worstIn <= THRESHOLD) {
      console.log(label + '   ok（句内最长 ' + worstIn.toFixed(2) + 's，换句 ' + tailGap.toFixed(2) + 's）');
    } else {
      console.log(label + '   句内最长 ' + worstIn.toFixed(2) + 's 超标（拍 ' + worstAt + ' 之后）');
      suggestions++;
    }
  });
});

console.log('\n全局最长句内空隙 ' + worstAll.toFixed(2) + 's，超标 ' + suggestions + ' 处');
process.exit(suggestions ? 1 : 0);
