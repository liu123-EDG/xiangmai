/* ==========================================================================
   传承之路 · 页面入口
   --------------------------------------------------------------------------
   一页一关：玩哪一关由 URL 参数 ?level= 决定。
     ?level=muqam  → 维吾尔族 · 十二木卡姆（戈壁）
     ?level=gesar  → 藏族 · 格萨尔（草原）

   为什么用参数而不是复制两份页面：
     同一份裁决逻辑、同一套素材路径、同一份样式。
     复制两份的话，以后改一处就要改两处，早晚会不一致。

   **用 ?level= 而不是 #hash**：站点要能在 file:// 下双击打开
   （用户一直是这么看的），query 在 file:// 下也能正常读。
   ========================================================================== */
import { bootChapter } from '../lib/chapter.js';
import { buildInheritGame } from '../lib/inherit-game.js';
import { levelByKey, playableLevels } from '../lib/levels-data.js';

/* 这一页是游戏，不要页脚章节导航；声音也交给游戏自己（视频自带音轨）。 */
const ctx = bootChapter({ active: 'fulu', sound: false });

const params = new URLSearchParams(location.search);
const level = params.get('level') || playableLevels()[0].level;
const L = levelByKey(level);

const html = document.documentElement;
if (L) {
  html.style.setProperty('--game-tone', L.scene === 'steppe' ? '168' : '36');
  document.title = L.name + '｜传承之路 · 弦脉';
}

const game = buildInheritGame({
  reduced: ctx.REDUCED,
  level,
  doneNote: '这一关走完了',
  doneLabel: '← 回到旋律图',
  onDone: () => { location.href = '../fulu/index.html#melody-act'; },
});

/* 自检用 */
window.__XM_GAME__ = game;
window.__XM_LEVEL__ = level;

/* 参数给错（比如手改地址）时别留一屏空白，直接回旋律图 */
if (!scene) {
  const t = document.getElementById('g-title');
  const x = document.getElementById('g-text');
  if (t) t.textContent = '没有这一关';
  if (x) x.textContent = '这个民族的关卡还没做。回到旋律图挑一个吧。';
}
